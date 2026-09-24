"use server";

import { requireAdmin } from "@/core/auth/session";
import {
  ALL_NOTIFICATION_TYPES,
  setNotificationTypeEnabled,
} from "@/core/notifications/prefs";
import { failResult, okResult, type ActionResult } from "@/lib/action-result";
import { NotificationType } from "@prisma/client";
import { revalidatePath } from "next/cache";

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
