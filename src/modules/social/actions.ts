"use server";

import { prisma } from "@/core/db";
import { requireHousehold } from "@/core/auth/session";
import { revalidatePath } from "next/cache";

export async function getDeliveries() {
  const { householdId } = await requireHousehold();
  return prisma.deliveryPackage.findMany({
    where: { householdId },
    orderBy: { expectedDate: "asc" },
  });
}

export async function createDelivery(formData: FormData) {
  const { householdId } = await requireHousehold();
  await prisma.deliveryPackage.create({
    data: {
      householdId,
      carrier: (formData.get("carrier") as string) || undefined,
      trackingNumber: (formData.get("trackingNumber") as string) || undefined,
      trackingUrl: (formData.get("trackingUrl") as string) || undefined,
      description: (formData.get("description") as string) || undefined,
      expectedDate: formData.get("expectedDate")
        ? new Date(formData.get("expectedDate") as string)
        : undefined,
      earliestTime: formData.get("earliestTime")
        ? new Date(formData.get("earliestTime") as string)
        : undefined,
      latestTime: formData.get("latestTime")
        ? new Date(formData.get("latestTime") as string)
        : undefined,
    },
  });
  revalidatePath("/delivery");
}

export async function updateDeliveryStatus(formData: FormData) {
  const id = formData.get("id") as string;
  const status = formData.get("status") as "PENDING" | "IN_TRANSIT" | "OUT_FOR_DELIVERY" | "DELIVERED" | "EXCEPTION";
  await prisma.deliveryPackage.update({ where: { id }, data: { status } });
  revalidatePath("/delivery");
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
  const { householdId, userId } = await requireHousehold();
  await prisma.message.create({
    data: {
      householdId,
      userId,
      content: formData.get("content") as string,
    },
  });
  revalidatePath("/messages");
}

export async function getRequests() {
  const { householdId } = await requireHousehold();
  return prisma.request.findMany({
    where: { householdId },
    include: { user: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function createRequest(formData: FormData) {
  const { householdId, userId } = await requireHousehold();
  await prisma.request.create({
    data: {
      householdId,
      userId,
      type: formData.get("type") as "GROCERY" | "TASK",
      title: formData.get("title") as string,
      description: (formData.get("description") as string) || undefined,
    },
  });
  revalidatePath("/messages");
}

export async function updateRequestStatus(formData: FormData) {
  const id = formData.get("id") as string;
  const status = formData.get("status") as "PENDING" | "APPROVED" | "REJECTED" | "COMPLETED";
  await prisma.request.update({ where: { id }, data: { status } });
  revalidatePath("/messages");
}

export async function getVisitorPreferences() {
  const { householdId } = await requireHousehold();
  return prisma.visitorPreference.findMany({ where: { householdId } });
}

export async function saveVisitorPreference(formData: FormData) {
  const { householdId } = await requireHousehold();
  const visitorName = formData.get("visitorName") as string;
  const preferences = JSON.parse((formData.get("preferences") as string) || "{}");

  await prisma.visitorPreference.upsert({
    where: { householdId_visitorName: { householdId, visitorName } },
    create: { householdId, visitorName, preferences },
    update: { preferences },
  });
  revalidatePath("/settings");
}
