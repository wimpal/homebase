import { NotificationType, type Notification } from "@prisma/client";
import { requireHousehold } from "@/core/auth/session";
import { prisma } from "@/core/db";
import { sendWebPush } from "./push";

export interface NotifyInput {
  householdId: string;
  userId?: string;
  type?: NotificationType;
  title: string;
  message: string;
  link?: string;
  /** When set, at most one row per household with this key (skip if exists). */
  dedupeKey?: string;
}

/** @deprecated Prefer `notify` — kept for any non-scheduler callers. */
export type CreateNotificationInput = NotifyInput;

export async function isNotificationTypeEnabled(
  householdId: string,
  type: NotificationType,
): Promise<boolean> {
  const setting = await prisma.notificationTypeSetting.findUnique({
    where: {
      householdId_type: { householdId, type },
    },
    select: { enabled: true },
  });
  return setting?.enabled ?? true;
}

/**
 * Create a Home Feed notification, respecting type prefs and dedupe keys.
 * Returns null when the type is disabled or an existing keyed row was skipped.
 */
export async function notify(
  input: NotifyInput,
): Promise<Notification | null> {
  const type = input.type ?? NotificationType.INFO;

  if (!(await isNotificationTypeEnabled(input.householdId, type))) {
    return null;
  }

  if (input.dedupeKey) {
    const existing = await prisma.notification.findUnique({
      where: {
        householdId_dedupeKey: {
          householdId: input.householdId,
          dedupeKey: input.dedupeKey,
        },
      },
    });
    if (existing) return existing;
  }

  try {
    const notification = await prisma.notification.create({
      data: {
        householdId: input.householdId,
        userId: input.userId,
        type,
        title: input.title,
        message: input.message,
        link: input.link,
        dedupeKey: input.dedupeKey,
      },
    });

    if (input.userId) {
      await sendWebPush(input.userId, {
        title: input.title,
        body: input.message,
        url: input.link,
      });
    }

    return notification;
  } catch (err) {
    // Concurrent cron ticks — unique(householdId, dedupeKey) race
    if (
      input.dedupeKey &&
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      return prisma.notification.findUnique({
        where: {
          householdId_dedupeKey: {
            householdId: input.householdId,
            dedupeKey: input.dedupeKey,
          },
        },
      });
    }
    throw err;
  }
}

/** Blind insert without prefs/dedupe — prefer `notify`. */
export async function createNotification(input: NotifyInput) {
  return notify(input);
}

export async function getNotifications(householdId: string, limit = 20) {
  return prisma.notification.findMany({
    where: { householdId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function markNotificationRead(id: string) {
  const { householdId } = await requireHousehold();
  const result = await prisma.notification.updateMany({
    where: { id, householdId },
    data: { read: true },
  });
  if (result.count === 0) throw new Error("Notification not found");
}

export async function markAllNotificationsRead() {
  const { householdId } = await requireHousehold();
  await prisma.notification.updateMany({
    where: { householdId, read: false },
    data: { read: true },
  });
}

export async function dismissNotification(id: string) {
  const { householdId } = await requireHousehold();
  const result = await prisma.notification.deleteMany({
    where: { id, householdId },
  });
  if (result.count === 0) throw new Error("Notification not found");
}

export async function getUnreadCount(householdId: string) {
  return prisma.notification.count({
    where: { householdId, read: false },
  });
}

export async function clearNotificationsByDedupeKey(
  householdId: string,
  dedupeKey: string,
) {
  await prisma.notification.deleteMany({
    where: { householdId, dedupeKey },
  });
}

/** Retention: read older than 30d; any older than 90d. */
export async function purgeOldNotifications(now = new Date()) {
  const readCutoff = new Date(now);
  readCutoff.setDate(readCutoff.getDate() - 30);
  const anyCutoff = new Date(now);
  anyCutoff.setDate(anyCutoff.getDate() - 90);

  const readPurged = await prisma.notification.deleteMany({
    where: { read: true, createdAt: { lt: readCutoff } },
  });
  const stalePurged = await prisma.notification.deleteMany({
    where: { createdAt: { lt: anyCutoff } },
  });

  return { readPurged: readPurged.count, stalePurged: stalePurged.count };
}
