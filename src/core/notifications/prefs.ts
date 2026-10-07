import { ModuleId, NotificationType } from "@prisma/client";
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

/**
 * Which module owns a notification type. Types absent here (INFO, WARNING,
 * REMINDER) are cross-cutting and always shown. REMINDER is deliberately
 * unmapped because it is shared by plants and calendar — the Home Feed
 * resolves those by link instead.
 */
export const NOTIFICATION_TYPE_MODULE: Partial<
  Record<NotificationType, ModuleId>
> = {
  [NotificationType.LOW_STOCK]: ModuleId.INVENTORY,
  [NotificationType.EXPIRY]: ModuleId.INVENTORY,
  [NotificationType.DELIVERY]: ModuleId.DELIVERY,
  [NotificationType.TASK]: ModuleId.TASKS,
};

/** Inverse of {@link NOTIFICATION_TYPE_MODULE}: types owned by a module. */
export function notificationTypesForModule(
  moduleId: ModuleId,
): NotificationType[] {
  return ALL_NOTIFICATION_TYPES.filter(
    (type) => NOTIFICATION_TYPE_MODULE[type] === moduleId,
  );
}

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
