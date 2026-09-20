import { NotificationType } from "@prisma/client";
import { prisma } from "@/core/db";

export const ALL_NOTIFICATION_TYPES: NotificationType[] = [
  NotificationType.INFO,
  NotificationType.WARNING,
  NotificationType.REMINDER,
  NotificationType.LOW_STOCK,
  NotificationType.EXPIRY,
  NotificationType.DELIVERY,
  NotificationType.TASK,
];

export async function getNotificationTypeSettings(
  householdId: string,
): Promise<Record<NotificationType, boolean>> {
  const rows = await prisma.notificationTypeSetting.findMany({
    where: { householdId },
    select: { type: true, enabled: true },
  });
  const byType = new Map(rows.map((r) => [r.type, r.enabled]));
  const result = {} as Record<NotificationType, boolean>;
  for (const type of ALL_NOTIFICATION_TYPES) {
    result[type] = byType.get(type) ?? true;
  }
  return result;
}

export async function setNotificationTypeEnabled(
  householdId: string,
  type: NotificationType,
  enabled: boolean,
) {
  await prisma.notificationTypeSetting.upsert({
    where: {
      householdId_type: { householdId, type },
    },
    create: { householdId, type, enabled },
    update: { enabled },
  });
}
