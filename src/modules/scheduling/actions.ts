"use server";

import { prisma } from "@/core/db";
import { requireHousehold } from "@/core/auth/session";
import { revalidatePath } from "next/cache";

export async function getCalendarEvents() {
  const { householdId } = await requireHousehold();
  return prisma.calendarEvent.findMany({
    where: { householdId },
    include: { guests: true },
    orderBy: { startAt: "asc" },
  });
}

export async function createCalendarEvent(formData: FormData) {
  const { householdId } = await requireHousehold();
  const title = formData.get("title") as string;
  const description = (formData.get("description") as string) || undefined;
  const startAt = new Date(formData.get("startAt") as string);
  const endAt = formData.get("endAt") ? new Date(formData.get("endAt") as string) : undefined;
  const atHome = formData.get("atHome") === "on";
  const reminderMinutes = parseInt((formData.get("reminderMinutes") as string) || "60", 10);
  const itemsNeeded = ((formData.get("itemsNeeded") as string) || "")
    .split(",")
    .map((i) => i.trim())
    .filter(Boolean);
  const guests = ((formData.get("guests") as string) || "")
    .split("\n")
    .map((g) => g.trim())
    .filter(Boolean);

  await prisma.calendarEvent.create({
    data: {
      householdId,
      title,
      description,
      startAt,
      endAt,
      atHome,
      reminderMinutes,
      itemsNeeded,
      guests: guests.length > 0 ? { create: guests.map((name) => ({ name })) } : undefined,
    },
  });
  revalidatePath("/calendar");
}

export async function getRoutines() {
  const { householdId } = await requireHousehold();
  return prisma.routine.findMany({
    where: { householdId },
    include: {
      members: { include: { user: true } },
      tasks: {
        include: {
          dependsOn: { include: { dependsOnTask: true } },
          completions: { orderBy: { completedAt: "desc" }, take: 5 },
        },
        orderBy: { order: "asc" },
      },
    },
  });
}

export async function createRoutine(formData: FormData) {
  const { householdId, userId } = await requireHousehold();
  const name = formData.get("name") as string;
  const description = (formData.get("description") as string) || undefined;

  await prisma.routine.create({
    data: {
      householdId,
      name,
      description,
      members: { create: { userId, role: "owner" } },
    },
  });
  revalidatePath("/routines");
}

export async function addRoutineTask(formData: FormData) {
  const routineId = formData.get("routineId") as string;
  const title = formData.get("title") as string;
  const recurrence = (formData.get("recurrence") as string) || "daily";
  const reminderMinutes = formData.get("reminderMinutes")
    ? parseInt(formData.get("reminderMinutes") as string, 10)
    : undefined;
  const points = parseInt((formData.get("points") as string) || "10", 10);
  const dependsOnTaskId = (formData.get("dependsOnTaskId") as string) || undefined;

  const task = await prisma.routineTask.create({
    data: { routineId, title, recurrence, reminderMinutes, points },
  });

  if (dependsOnTaskId) {
    await prisma.routineTaskDependency.create({
      data: { taskId: task.id, dependsOnTaskId },
    });
  }

  revalidatePath("/routines");
}

export async function completeRoutineTask(formData: FormData) {
  const { userId } = await requireHousehold();
  const taskId = formData.get("taskId") as string;
  const durationMin = formData.get("durationMin")
    ? parseInt(formData.get("durationMin") as string, 10)
    : undefined;

  const task = await prisma.routineTask.findUnique({
    where: { id: taskId },
    include: { dependsOn: { include: { dependsOnTask: { include: { completions: true } } } } },
  });
  if (!task) return;

  for (const dep of task.dependsOn) {
    if (dep.dependsOnTask.completions.length === 0) {
      throw new Error(`Complete "${dep.dependsOnTask.title}" first`);
    }
  }

  await prisma.routineTaskCompletion.create({
    data: { taskId, userId, durationMin },
  });

  let points = await prisma.userPoints.findUnique({ where: { userId } });
  if (!points) {
    points = await prisma.userPoints.create({ data: { userId, points: task.points, streak: 1 } });
  } else {
    await prisma.userPoints.update({
      where: { userId },
      data: { points: points.points + task.points, streak: points.streak + 1 },
    });
  }

  if (points.streak >= 7) {
    const badge = await prisma.badge.findUnique({ where: { name: "Week Streak" } });
    if (badge) {
      await prisma.userBadge.upsert({
        where: { userId_badgeId: { userId, badgeId: badge.id } },
        create: { userId, badgeId: badge.id },
        update: {},
      });
    }
  }

  revalidatePath("/routines");
}

export async function getRoutineTemplates() {
  const { householdId } = await requireHousehold();
  return prisma.routineTemplate.findMany({
    where: { householdId },
    include: { tasks: { orderBy: { order: "asc" } } },
  });
}

export async function createRoutineFromTemplate(formData: FormData) {
  const { householdId, userId } = await requireHousehold();
  const templateId = formData.get("templateId") as string;
  const template = await prisma.routineTemplate.findUnique({
    where: { id: templateId },
    include: { tasks: true },
  });
  if (!template) return;

  await prisma.routine.create({
    data: {
      householdId,
      name: template.name,
      description: template.description,
      members: { create: { userId, role: "owner" } },
      tasks: {
        create: template.tasks.map((t) => ({
          title: t.title,
          recurrence: t.recurrence,
          order: t.order,
        })),
      },
    },
  });
  revalidatePath("/routines");
}

export async function getEventLogs() {
  const { householdId } = await requireHousehold();
  return prisma.eventLog.findMany({
    where: { householdId },
    orderBy: { occurredAt: "desc" },
  });
}

export async function logEvent(formData: FormData) {
  const { householdId } = await requireHousehold();
  await prisma.eventLog.create({
    data: {
      householdId,
      title: formData.get("title") as string,
      description: (formData.get("description") as string) || undefined,
      occurredAt: formData.get("occurredAt")
        ? new Date(formData.get("occurredAt") as string)
        : new Date(),
    },
  });
  revalidatePath("/calendar");
}

export async function getUserGamification(userId: string) {
  const points = await prisma.userPoints.findUnique({ where: { userId } });
  const badges = await prisma.userBadge.findMany({
    where: { userId },
    include: { badge: true },
  });
  return { points, badges };
}
