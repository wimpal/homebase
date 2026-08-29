"use server";

import { prisma } from "@/core/db";
import { requireHousehold, requireMutationAccess } from "@/core/auth/session";
import { assertProject } from "@/core/tenancy/assertHouseholdResource";
import { isDomainError } from "@/domain/error";
import {
  addChore,
  completeChoreDomain,
  isChoreActive,
  listChoreHistory,
} from "@/domain/tasks";
import { ModuleId } from "@prisma/client";
import { getAverageChoreDuration } from "@/core/scheduler";
import { addDays } from "date-fns";
import { revalidatePath } from "next/cache";
import { saveUpload } from "@/core/uploads/service";

export async function getChores() {
  const { householdId } = await requireHousehold();
  const chores = await prisma.chore.findMany({
    where: { householdId },
    include: {
      completions: {
        orderBy: { completedAt: "desc" },
        take: 10,
        select: { completedAt: true, durationMin: true },
      },
    },
    orderBy: { nextDue: "asc" },
  });

  return chores.filter((chore) => isChoreActive(chore));
}

export async function getChoreHistory() {
  const { householdId } = await requireHousehold();
  return listChoreHistory(householdId, { limit: 50 });
}

export async function createChore(formData: FormData) {
  const { householdId } = await requireMutationAccess(ModuleId.TASKS);
  const title = formData.get("title") as string;
  const description = (formData.get("description") as string) || undefined;
  const intervalDays = formData.get("intervalDays")
    ? parseInt(formData.get("intervalDays") as string, 10)
    : undefined;
  const deadline = formData.get("deadline")
    ? new Date(formData.get("deadline") as string)
    : undefined;

  const result = await addChore(householdId, {
    title,
    description,
    intervalDays,
    deadline,
  });
  if (isDomainError(result)) {
    throw new Error(result.message);
  }
  revalidatePath("/tasks");
}

export async function completeChore(formData: FormData) {
  const { householdId, userId } = await requireMutationAccess(ModuleId.TASKS);
  const choreId = formData.get("choreId") as string;
  const durationMin = formData.get("durationMin")
    ? parseInt(formData.get("durationMin") as string, 10)
    : undefined;
  const startedAtRaw = formData.get("startedAt") as string | null;
  const startedAt =
    startedAtRaw && startedAtRaw.trim()
      ? new Date(startedAtRaw)
      : undefined;

  const result = await completeChoreDomain(householdId, {
    id: choreId,
    userId,
    durationMin,
    startedAt,
  });
  if (isDomainError(result)) {
    throw new Error(result.message);
  }

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
}

export type ChoreFormState = { error?: string };

export async function createChoreWithState(
  _prev: ChoreFormState,
  formData: FormData,
): Promise<ChoreFormState> {
  try {
    await createChore(formData);
    return {};
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to create chore",
    };
  }
}

export async function completeChoreWithState(
  _prev: ChoreFormState,
  formData: FormData,
): Promise<ChoreFormState> {
  try {
    await completeChore(formData);
    return {};
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to complete chore",
    };
  }
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
  const { householdId } = await requireMutationAccess(ModuleId.TASKS);
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
  const { householdId } = await requireMutationAccess(ModuleId.TASKS);
  const id = formData.get("id") as string;
  const completed = formData.get("completed") === "true";
  const result = await prisma.projectStep.updateMany({
    where: { id, project: { householdId } },
    data: { completed },
  });
  if (result.count === 0) throw new Error("Project step not found");
  revalidatePath("/tasks");
}

export async function addProjectUpdate(formData: FormData) {
  const { householdId, userId } = await requireMutationAccess(ModuleId.TASKS);
  const projectId = formData.get("projectId") as string;
  const comment = formData.get("comment") as string;
  const photo = formData.get("photo") as File | null;
  await assertProject(householdId, projectId);

  let photoUrl: string | undefined;
  if (photo && photo.size > 0) {
    photoUrl = await saveUpload(photo, { householdId, subdir: "projects" });
  }

  await prisma.projectUpdate.create({
    data: { projectId, userId, comment, photoUrl },
  });
  revalidatePath("/tasks");
}

export async function getDashboardTodos() {
  const { householdId } = await requireHousehold();
  const now = new Date();
  const chores = await prisma.chore.findMany({
    where: {
      householdId,
      OR: [
        { nextDue: { lte: addDays(now, 7) } },
        { deadline: { lte: addDays(now, 7) } },
      ],
    },
    include: {
      completions: {
        select: { completedAt: true, durationMin: true },
        orderBy: { completedAt: "desc" },
      },
    },
    take: 20,
  });

  return chores
    .filter((chore) => isChoreActive(chore, now))
    .slice(0, 10)
    .map((c) => ({
      ...c,
      avgDuration: getAverageChoreDuration(c.completions),
    }));
}
