"use server";

import { requireAdmin, requireHousehold } from "@/core/auth/session";
import {
  ALL_NOTIFICATION_TYPES,
  setNotificationTypeEnabled,
} from "@/core/notifications/prefs";
import { failResult, okResult, type ActionResult, fromDomainError } from "@/lib/action-result";
import { NotificationType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { isDomainError } from "@/domain/error";
import { isThemePreference } from "@/domain/accounts/theme-preference";
import { setThemePreference } from "@/domain/accounts/theme";

export async function toggleNotificationTypeAction(
  formData: FormData,
): Promise<ActionResult> {
  const { householdId } = await requireAdmin();
  const type = formData.get("type") as NotificationType;
  if (!ALL_NOTIFICATION_TYPES.includes(type)) {
    return failResult("Invalid notification type", "invalid_notification_type");
  }
  const enabled = formData.get("enabled") === "true";
  await setNotificationTypeEnabled(householdId, type, enabled);
  revalidatePath("/settings");
  return okResult();
}

/** Personal appearance preference (T-123); any role including GUEST. */
export async function setThemePreferenceAction(
  formData: FormData,
): Promise<ActionResult> {
  const { userId } = await requireHousehold();
  const value = formData.get("theme");
  if (!isThemePreference(value)) {
    return failResult("Invalid theme preference.", "theme_invalid");
  }
  const result = await setThemePreference(userId, value);
  if (isDomainError(result)) return fromDomainError(result);
  revalidatePath("/settings");
  return okResult();
}

