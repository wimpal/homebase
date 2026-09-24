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
  okResult,
} from "@/lib/action-result";

const requestInputSchema = z.object({
  type: z.enum(["GROCERY", "TASK"]),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2_000).optional(),
});

const deliveryStatusSchema = z.enum([
  "PENDING",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "EXCEPTION",
]);

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

export async function updateDeliveryStatus(
  formData: FormData,
): Promise<ActionResult> {
  const { householdId } = await requireMutationAccess(ModuleId.DELIVERY);
  const id = formData.get("id") as string;
  const parsed = deliveryStatusSchema.safeParse(formData.get("status"));
  if (!parsed.success) {
    return failResult("Invalid delivery status", "invalid_delivery_status");
  }
  const result = await prisma.deliveryPackage.updateMany({
    where: { id, householdId },
    data: { status: parsed.data },
  });
  if (result.count === 0) {
    return failResult("Delivery not found", "delivery_not_found");
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
