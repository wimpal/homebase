import { NotificationType } from "@prisma/client";
import { prisma } from "@/core/db";
import { sendWebPush } from "./push";

export interface CreateNotificationInput {
  householdId: string;
  userId?: string;
  type?: NotificationType;
  title: string;
  message: string;
  link?: string;
}

export async function createNotification(input: CreateNotificationInput) {
  const notification = await prisma.notification.create({
    data: {
      householdId: input.householdId,
      userId: input.userId,
      type: input.type ?? NotificationType.INFO,
      title: input.title,
      message: input.message,
      link: input.link,
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
}

export async function getNotifications(householdId: string, limit = 20) {
  return prisma.notification.findMany({
    where: { householdId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function markNotificationRead(id: string) {
  return prisma.notification.update({
    where: { id },
    data: { read: true },
  });
}

export async function getUnreadCount(householdId: string) {
  return prisma.notification.count({
    where: { householdId, read: false },
  });
}
