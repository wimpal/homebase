"use server";

import { prisma } from "@/core/db";
import { requireHousehold, requireMutationAccess } from "@/core/auth/session";
import { requireModule } from "@/core/modules/guard";
import { ModuleId, Prisma, RequestStatus, RequestType, Role } from "@prisma/client";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import {
  type ActionResult,
  failResult,
  fromDomainError,
  okResult,
} from "@/lib/action-result";
import { isDomainError } from "@/domain/error";
import { addDelivery, setDeliveryStatus } from "@/domain/delivery";

const requestInputSchema = z.object({
  type: z.enum(["GROCERY", "TASK"]),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2_000).optional(),
});

export async function getDeliveries() {
  const { householdId } = await requireHousehold();
  return prisma.deliveryPackage.findMany({
    where: { householdId },
    orderBy: { expectedDate: "asc" },
  });
}

function formDateToIso(value: FormDataEntryValue | null): string | undefined {
  if (!value || typeof value !== "string" || !value.trim()) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

export async function createDelivery(formData: FormData) {
  const { householdId } = await requireMutationAccess(ModuleId.DELIVERY);
  const descriptionRaw = String(formData.get("description") ?? "").trim();
  const carrier = String(formData.get("carrier") ?? "").trim() || undefined;
  const trackingNumber =
    String(formData.get("trackingNumber") ?? "").trim() || undefined;
  const description =
    descriptionRaw || carrier || trackingNumber || "Package";

  const expectedRaw = String(formData.get("expectedDate") ?? "").trim();
  const result = await addDelivery(householdId, {
    description,
    carrier,
    tracking_number: trackingNumber,
    tracking_url: String(formData.get("trackingUrl") ?? "").trim() || undefined,
    expected_date: expectedRaw || undefined,
    earliest_time: formDateToIso(formData.get("earliestTime")),
    latest_time: formDateToIso(formData.get("latestTime")),
  });
  if (isDomainError(result)) {
    throw result;
  }
  revalidatePath("/delivery");
}

export async function updateDeliveryStatus(
  formData: FormData,
): Promise<ActionResult> {
  const { householdId } = await requireMutationAccess(ModuleId.DELIVERY);
  const id = formData.get("id") as string;
  const status = String(formData.get("status") ?? "");
  const result = await setDeliveryStatus(householdId, { id, status });
  if (isDomainError(result)) {
    return fromDomainError(result);
  }
  revalidatePath("/delivery");
  return okResult();
}

export async function getMessages() {
  const { householdId } = await requireHousehold();
  return prisma.message.findMany({
    where: { householdId },
    include: { user: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function sendMessage(formData: FormData) {
  const { householdId, userId } = await requireMutationAccess(ModuleId.MESSAGING);
  const content = z.string().trim().min(1).max(4_000).parse(formData.get("content"));
  await prisma.message.create({
    data: {
      householdId,
      userId,
      content,
    },
  });
  revalidatePath("/messages");
}

/** Grocery/TASK requests only — SUPPORT is admin-only via getSupportRequests. */
export async function getRequests() {
  const { householdId } = await requireHousehold();
  return prisma.request.findMany({
    where: {
      householdId,
      type: { in: [RequestType.GROCERY, RequestType.TASK] },
    },
    include: { user: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function createRequest(formData: FormData) {
  const { householdId, userId } = await requireMutationAccess(ModuleId.MESSAGING);
  const input = requestInputSchema.parse({
    type: formData.get("type"),
    title: formData.get("title"),
    description: (formData.get("description") as string) || undefined,
  });
  await prisma.request.create({
    data: {
      householdId,
      userId,
      ...input,
    },
  });
  revalidatePath("/messages");
}

export async function updateRequestStatus(
  formData: FormData,
): Promise<ActionResult> {
  const { householdId, role } = await requireHousehold();
  if (role !== Role.ADMIN) {
    throw new Error("Admin required");
  }
  const id = formData.get("id") as string;
  const statusParsed = z.nativeEnum(RequestStatus).safeParse(formData.get("status"));
  if (!statusParsed.success) {
    return failResult("Invalid status", "invalid_status");
  }
  const existing = await prisma.request.findFirst({
    where: { id, householdId },
  });
  if (!existing) {
    return failResult("Request not found", "delivery_not_found");
  }
  if (existing.type !== RequestType.SUPPORT) {
    await requireModule(householdId, ModuleId.MESSAGING);
  }
  await prisma.request.update({
    where: { id },
    data: { status: statusParsed.data },
  });
  revalidatePath("/messages");
  return okResult();
}

export async function getVisitorPreferences() {
  const { householdId } = await requireHousehold();
  return prisma.visitorPreference.findMany({ where: { householdId } });
}

export async function saveVisitorPreference(
  formData: FormData,
): Promise<ActionResult> {
  const { householdId } = await requireMutationAccess(ModuleId.MESSAGING);
  const visitorName = (formData.get("visitorName") as string)?.trim();
  if (!visitorName) {
    return failResult("Visitor name is required.", "name_required");
  }
  let preferences: Record<string, unknown>;
  try {
    preferences = z
      .record(z.unknown())
      .parse(JSON.parse((formData.get("preferences") as string) || "{}"));
  } catch {
    return failResult(
      "Invalid visitor preference data.",
      "invalid_visitor_preference",
    );
  }

  await prisma.visitorPreference.upsert({
    where: { householdId_visitorName: { householdId, visitorName } },
    create: {
      householdId,
      visitorName,
      preferences: preferences as Prisma.InputJsonValue,
    },
    update: { preferences: preferences as Prisma.InputJsonValue },
  });
  revalidatePath("/settings");
  return okResult();
}

export async function deleteDelivery(formData: FormData): Promise<ActionResult> {
  const { householdId } = await requireMutationAccess(ModuleId.DELIVERY);
  const id = formData.get("id") as string;
  if (!id) return okResult();
  const result = await prisma.deliveryPackage.deleteMany({
    where: { id, householdId },
  });
  if (result.count === 0) {
    return failResult("Delivery not found", "delivery_not_found");
  }
  revalidatePath("/delivery");
  return okResult();
}

export async function deleteVisitorPreference(
  formData: FormData,
): Promise<ActionResult> {
  const { householdId } = await requireMutationAccess(ModuleId.MESSAGING);
  const id = formData.get("id") as string;
  if (!id) return okResult();
  const result = await prisma.visitorPreference.deleteMany({
    where: { id, householdId },
  });
  if (result.count === 0) {
    return failResult(
      "Visitor preference not found",
      "visitor_preference_not_found",
    );
  }
  revalidatePath("/settings");
  return okResult();
}
