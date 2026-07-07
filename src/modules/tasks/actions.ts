"use server";

import { prisma } from "@/core/db";
import { requireHousehold } from "@/core/auth/session";
import { getAverageChoreDuration } from "@/core/scheduler";
import { addDays } from "date-fns";
import { revalidatePath } from "next/cache";
import { saveUpload } from "@/core/uploads/service";

export async function getChores() {
  const { householdId } = await requireHousehold();
  return prisma.chore.findMany({
    where: { householdId },
    include: {
      completions: { orderBy: { completedAt: "desc" }, take: 10 },
    },
    orderBy: { nextDue: "asc" },
  });
}

export async function createChore(formData: FormData) {
  const { householdId } = await requireHousehold();
  const title = formData.get("title") as string;
  const description = (formData.get("description") as string) || undefined;
  const intervalDays = formData.get("intervalDays")
    ? parseInt(formData.get("intervalDays") as string, 10)
    : undefined;
  const deadline = formData.get("deadline")
    ? new Date(formData.get("deadline") as string)
    : undefined;

  await prisma.chore.create({
    data: {
      householdId,
      title,
      description,
      intervalDays,
      deadline,
      nextDue: intervalDays ? addDays(new Date(), intervalDays) : undefined,
    },
  });
  revalidatePath("/tasks");
}

export async function completeChore(formData: FormData) {
  const { userId } = await requireHousehold();
  const choreId = formData.get("choreId") as string;
  const durationMin = formData.get("durationMin")
    ? parseInt(formData.get("durationMin") as string, 10)
    : undefined;

  const chore = await prisma.chore.findUnique({ where: { id: choreId } });
  if (!chore) return;

  await prisma.choreCompletion.create({
    data: { choreId, userId, durationMin },
  });

  if (chore.intervalDays) {
    await prisma.chore.update({
      where: { id: choreId },
      data: { nextDue: addDays(new Date(), chore.intervalDays) },
    });
  }

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
}

export async function getProjects() {
  const { householdId } = await requireHousehold();
  return prisma.project.findMany({
    where: { householdId },
    include: {
      steps: { orderBy: { order: "asc" } },
      updates: { include: { user: true }, orderBy: { createdAt: "desc" }, take: 5 },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function createProject(formData: FormData) {
  const { householdId } = await requireHousehold();
  const title = formData.get("title") as string;
  const description = (formData.get("description") as string) || undefined;
  const steps = ((formData.get("steps") as string) || "").split("\n").filter(Boolean);

  await prisma.project.create({
    data: {
      householdId,
      title,
      description,
      steps: {
        create: steps.map((title, order) => ({ title, order })),
      },
    },
  });
  revalidatePath("/tasks");
}

export async function toggleProjectStep(formData: FormData) {
  const id = formData.get("id") as string;
  const completed = formData.get("completed") === "true";
  await prisma.projectStep.update({ where: { id }, data: { completed } });
  revalidatePath("/tasks");
}

export async function addProjectUpdate(formData: FormData) {
  const { userId } = await requireHousehold();
  const projectId = formData.get("projectId") as string;
  const comment = formData.get("comment") as string;
  const photo = formData.get("photo") as File | null;

  let photoUrl: string | undefined;
  if (photo && photo.size > 0) {
    photoUrl = await saveUpload(photo, "projects");
  }

  await prisma.projectUpdate.create({
    data: { projectId, userId, comment, photoUrl },
  });
  revalidatePath("/tasks");
}

export async function getDashboardTodos() {
  const { householdId } = await requireHousehold();
  const chores = await prisma.chore.findMany({
    where: {
      householdId,
      OR: [
        { nextDue: { lte: addDays(new Date(), 7) } },
        { deadline: { lte: addDays(new Date(), 7) } },
      ],
    },
    include: { completions: { take: 5 } },
    take: 10,
  });

  return chores.map((c) => ({
    ...c,
    avgDuration: getAverageChoreDuration(c.completions),
  }));
}
