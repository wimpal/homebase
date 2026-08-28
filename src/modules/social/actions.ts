"use server";

import { prisma } from "@/core/db";
import { requireAdmin, requireHousehold, requireMutationAccess } from "@/core/auth/session";
import { assertRequest } from "@/core/tenancy/assertHouseholdResource";
import { requireModule } from "@/core/modules/guard";
import { ModuleId, Prisma, RequestStatus } from "@prisma/client";
import { z } from "zod";
import { revalidatePath } from "next/cache";

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

export async function createDelivery(formData: FormData) {
  const { householdId } = await requireMutationAccess(ModuleId.DELIVERY);
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
  const { householdId } = await requireMutationAccess(ModuleId.DELIVERY);
  const id = formData.get("id") as string;
  const deliveryStatus = z.enum(["PENDING", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "EXCEPTION"]).parse(formData.get("status"));
  const result = await prisma.deliveryPackage.updateMany({
    where: { id, householdId },
    data: { status: deliveryStatus },
  });
  if (result.count === 0) throw new Error("Delivery not found");
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

export async function getRequests() {
  const { householdId } = await requireHousehold();
  return prisma.request.findMany({
    where: { householdId },
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

export async function updateRequestStatus(formData: FormData) {
  const { householdId } = await requireAdmin();
  await requireModule(householdId, ModuleId.MESSAGING);
  const id = formData.get("id") as string;
  const status = z.nativeEnum(RequestStatus).parse(formData.get("status"));
  await assertRequest(householdId, id);
  await prisma.request.update({ where: { id }, data: { status } });
  revalidatePath("/messages");
}

export async function getVisitorPreferences() {
  const { householdId } = await requireHousehold();
  return prisma.visitorPreference.findMany({ where: { householdId } });
}

export async function saveVisitorPreference(formData: FormData) {
  const { householdId } = await requireMutationAccess(ModuleId.MESSAGING);
  const visitorName = formData.get("visitorName") as string;
  const preferences = z.record(z.unknown()).parse(JSON.parse((formData.get("preferences") as string) || "{}"));

  await prisma.visitorPreference.upsert({
    where: { householdId_visitorName: { householdId, visitorName } },
    create: { householdId, visitorName, preferences: preferences as Prisma.InputJsonValue },
    update: { preferences: preferences as Prisma.InputJsonValue },
  });
  revalidatePath("/settings");
}
