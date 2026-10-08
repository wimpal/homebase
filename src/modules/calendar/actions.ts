"use server";

import { prisma } from "@/core/db";
import { requireHousehold, requireMutationAccess } from "@/core/auth/session";
import { requireModule } from "@/core/modules/guard";
import { isModuleEnabled } from "@/core/modules/settings";
import { isDomainError } from "@/domain/error";
import {
  createCalendarSubscription as createCalendarSubscriptionDomain,
  getCalendarLayerPrefs,
  listCalendarOccurrences,
  listCalendarSubscriptions,
  removeCalendarSubscription,
  setCalendarLayerPref,
  setCalendarSubscriptionEnabled as setCalendarSubscriptionEnabledDomain,
  syncCalendarSubscription,
  updateCalendarSubscription as updateCalendarSubscriptionDomain,
} from "@/domain/calendar";
import { isCalendarLayer } from "@/domain/calendar/types";
import { completeChoreDomain, isChoreActive } from "@/domain/tasks";
import {
  type ActionResult,
  failResult,
  fromDomainError,
  okResult,
} from "@/lib/action-result";
import { ModuleId } from "@prisma/client";
import { revalidatePath } from "next/cache";

export async function getCalendarSubscriptions() {
  const { householdId } = await requireHousehold();
  return listCalendarSubscriptions(householdId);
}

export async function getCalendarOccurrences(fromIso: string, toIso: string) {
  const { householdId } = await requireHousehold();
  const from = new Date(fromIso);
  const to = new Date(toIso);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return [];
  return listCalendarOccurrences(householdId, from, to);
}

/**
 * Open Chores with a real `deadline` (never `nextDue`-only) in the range.
 * Hidden when the Tasks module is disabled — same module-gating rule as /tasks.
 */
export async function getCalendarDeadlineChores(fromIso: string, toIso: string) {
  const { householdId } = await requireHousehold();
  const from = new Date(fromIso);
  const to = new Date(toIso);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return [];
  if (!(await isModuleEnabled(householdId, ModuleId.TASKS))) return [];

  const chores = await prisma.chore.findMany({
    where: { householdId, deadline: { gte: from, lt: to } },
    include: {
      completions: {
        select: { completedAt: true },
        orderBy: { completedAt: "desc" },
      },
    },
    orderBy: { deadline: "asc" },
  });

  return chores
    .filter((chore) => isChoreActive(chore))
    .map((chore) => ({
      id: chore.id,
      title: chore.title,
      description: chore.description,
      deadline: chore.deadline,
      intervalDays: chore.intervalDays,
      nextDue: chore.nextDue,
    }));
}

export async function getMyCalendarLayerPrefs() {
  const { householdId, userId } = await requireHousehold();
  await requireModule(householdId, ModuleId.CALENDAR);
  return getCalendarLayerPrefs(userId, householdId);
}

export async function createCalendarSubscription(
  formData: FormData,
): Promise<ActionResult> {
  const { householdId } = await requireMutationAccess(ModuleId.CALENDAR);
  const result = await createCalendarSubscriptionDomain(householdId, {
    name: (formData.get("name") as string) || "",
    url: (formData.get("url") as string) || "",
    color: (formData.get("color") as string) || "emerald",
  });
  if (isDomainError(result)) {
    return fromDomainError(result);
  }

  await syncCalendarSubscription(result.id);
  revalidatePath("/calendar");
  return okResult();
}

export async function updateCalendarSubscription(
  formData: FormData,
): Promise<ActionResult> {
  const { householdId } = await requireMutationAccess(ModuleId.CALENDAR);
  const id = (formData.get("id") as string) || "";
  if (!id) return failResult("Subscription not found", "feed_not_found");

  const result = await updateCalendarSubscriptionDomain(householdId, id, {
    name: (formData.get("name") as string) || undefined,
    color: (formData.get("color") as string) || undefined,
  });
  if (isDomainError(result)) {
    return fromDomainError(result);
  }
  revalidatePath("/calendar");
  return okResult();
}

export async function setCalendarSubscriptionEnabled(
  formData: FormData,
): Promise<void> {
  const { householdId } = await requireMutationAccess(ModuleId.CALENDAR);
  const id = (formData.get("id") as string) || "";
  if (!id) return;
  const enabled = formData.get("enabled") === "true";

  const result = await setCalendarSubscriptionEnabledDomain(
    householdId,
    id,
    enabled,
  );
  if (result) {
    throw new Error(result.message);
  }

  if (enabled) {
    await syncCalendarSubscription(id);
  }
  revalidatePath("/calendar");
}

export async function deleteCalendarSubscription(
  formData: FormData,
): Promise<void> {
  const { householdId } = await requireMutationAccess(ModuleId.CALENDAR);
  const id = (formData.get("id") as string) || "";
  if (!id) return;
  const result = await removeCalendarSubscription(householdId, id);
  if (result) {
    throw new Error(result.message);
  }
  revalidatePath("/calendar");
}

export async function syncCalendarSubscriptionNow(
  formData: FormData,
): Promise<ActionResult> {
  const { householdId } = await requireMutationAccess(ModuleId.CALENDAR);
  const id = (formData.get("id") as string) || "";
  if (!id) return failResult("Subscription not found", "feed_not_found");

  const subscription = await prisma.calendarSubscription.findFirst({
    where: { id, householdId },
    select: { id: true },
  });
  if (!subscription) {
    return failResult("Subscription not found", "feed_not_found");
  }

  // Feed-level failures are recorded on the row and shown calmly in the UI.
  await syncCalendarSubscription(id);
  revalidatePath("/calendar");
  return okResult();
}

export async function setCalendarLayerPreference(
  formData: FormData,
): Promise<void> {
  const { householdId, userId } = await requireHousehold();
  await requireModule(householdId, ModuleId.CALENDAR);
  const layerRaw = formData.get("layer") as string;
  if (!isCalendarLayer(layerRaw)) return;
  const enabled = formData.get("enabled") === "true";
  await setCalendarLayerPref(userId, householdId, layerRaw, enabled);
  revalidatePath("/calendar");
}

/** Complete an open deadline Chore from the calendar day panel (acceptance 5). */
export async function completeCalendarChore(
  formData: FormData,
): Promise<ActionResult> {
  const { householdId, userId } = await requireMutationAccess(ModuleId.TASKS);
  const choreId = (formData.get("choreId") as string) || "";
  if (!choreId) return failResult("Chore not found", "chore_not_found");

  const result = await completeChoreDomain(householdId, { id: choreId, userId });
  if (isDomainError(result)) {
    return fromDomainError(result);
  }
  revalidatePath("/calendar");
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  return okResult();
}
