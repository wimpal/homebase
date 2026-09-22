"use server";

import { prisma } from "@/core/db";
import { requireHousehold, requireMutationAccess } from "@/core/auth/session";
import {
  assertChore,
  assertProject,
  assertProjectFile,
  assertProjectVisionPin,
  assertProjectVisionPinLink,
  assertProjectWorkItem,
} from "@/core/tenancy/assertHouseholdResource";
import { isDomainError } from "@/domain/error";
import {
  addChore,
  completeChoreDomain,
  isChoreActive,
  listChoreHistory,
} from "@/domain/tasks";
import {
  clampPct,
  clampPinSizePct,
  isProjectStatus,
  isVisionPinKind,
  isWorkItemStatus,
  normalizePinLinkIds,
  projectDetailPath,
  type WorkItemStatus,
} from "@/domain/tasks/projectConstants";
import { ModuleId } from "@prisma/client";
import { getAverageChoreDuration } from "@/core/scheduler";
import { addDays } from "date-fns";
import { revalidatePath } from "next/cache";
import { deleteUploadsByUrls, saveUpload } from "@/core/uploads/service";

const userNameSelect = { id: true, name: true } as const;

function revalidateProjectPaths(projectId?: string) {
  revalidatePath("/tasks");
  if (projectId) revalidatePath(projectDetailPath(projectId));
}

async function touchProject(projectId: string) {
  await prisma.project.update({
    where: { id: projectId },
    data: { updatedAt: new Date() },
  });
}

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
      workItems: {
        select: { id: true, status: true },
      },
      _count: {
        select: { files: true, visionPins: true, updates: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getProject(projectId: string) {
  const { householdId } = await requireHousehold();
  const project = await prisma.project.findFirst({
    where: { id: projectId, householdId },
    include: {
      workItems: { orderBy: [{ status: "asc" }, { order: "asc" }] },
      files: {
        orderBy: { createdAt: "desc" },
        include: { user: { select: userNameSelect } },
      },
      visionPins: { orderBy: { zIndex: "asc" } },
      visionPinLinks: true,
      updates: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { user: { select: userNameSelect } },
      },
    },
  });
  if (!project) throw new Error("Project not found");
  return project;
}

function visionPinDto(pin: {
  id: string;
  kind: string;
  body: string | null;
  imageUrl: string | null;
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
  zIndex: number;
}) {
  return {
    id: pin.id,
    kind: pin.kind,
    body: pin.body,
    imageUrl: pin.imageUrl,
    xPct: pin.xPct,
    yPct: pin.yPct,
    wPct: pin.wPct,
    hPct: pin.hPct,
    zIndex: pin.zIndex,
  };
}

export async function createProject(formData: FormData) {
  const { householdId } = await requireMutationAccess(ModuleId.TASKS);
  const title = (formData.get("title") as string)?.trim();
  if (!title) throw new Error("Title is required");
  const description = ((formData.get("description") as string) || "").trim() || undefined;
  const items = ((formData.get("workItems") as string) || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const project = await prisma.project.create({
    data: {
      householdId,
      title,
      description,
      status: "active",
      workItems: {
        create: items.map((itemTitle, order) => ({
          title: itemTitle,
          status: "backlog",
          order,
        })),
      },
    },
  });
  revalidateProjectPaths(project.id);
}

export async function updateProjectStatus(formData: FormData) {
  const { householdId } = await requireMutationAccess(ModuleId.TASKS);
  const id = formData.get("id") as string;
  const status = formData.get("status") as string;
  if (!isProjectStatus(status)) throw new Error("Invalid project status");
  await assertProject(householdId, id);
  await prisma.project.update({ where: { id }, data: { status } });
  revalidateProjectPaths(id);
}

export async function updateProjectMeta(formData: FormData) {
  const { householdId } = await requireMutationAccess(ModuleId.TASKS);
  const id = formData.get("id") as string;
  const title = (formData.get("title") as string)?.trim();
  if (!title) throw new Error("Title is required");
  const description = ((formData.get("description") as string) || "").trim() || null;
  await assertProject(householdId, id);
  await prisma.project.update({ where: { id }, data: { title, description } });
  revalidateProjectPaths(id);
}

export async function addWorkItem(formData: FormData) {
  const { householdId } = await requireMutationAccess(ModuleId.TASKS);
  const projectId = formData.get("projectId") as string;
  const title = (formData.get("title") as string)?.trim();
  if (!title) throw new Error("Title is required");
  const notes = ((formData.get("notes") as string) || "").trim() || null;
  const statusRaw = (formData.get("status") as string) || "backlog";
  if (!isWorkItemStatus(statusRaw)) throw new Error("Invalid work item status");
  await assertProject(householdId, projectId);

  const max = await prisma.projectWorkItem.aggregate({
    where: { projectId, status: statusRaw },
    _max: { order: true },
  });
  const order = (max._max.order ?? -1) + 1;

  const item = await prisma.projectWorkItem.create({
    data: { projectId, title, notes, status: statusRaw, order },
  });
  await touchProject(projectId);
  revalidateProjectPaths(projectId);
  return {
    id: item.id,
    title: item.title,
    notes: item.notes,
    status: item.status,
    order: item.order,
  };
}

export async function updateWorkItem(formData: FormData) {
  const { householdId } = await requireMutationAccess(ModuleId.TASKS);
  const id = formData.get("id") as string;
  const title = (formData.get("title") as string)?.trim();
  if (!title) throw new Error("Title is required");
  const notes = ((formData.get("notes") as string) || "").trim() || null;
  const item = await assertProjectWorkItem(householdId, id);
  await prisma.projectWorkItem.update({
    where: { id },
    data: { title, notes },
  });
  await touchProject(item.projectId);
  revalidateProjectPaths(item.projectId);
}

export async function deleteWorkItem(formData: FormData) {
  const { householdId } = await requireMutationAccess(ModuleId.TASKS);
  const id = formData.get("id") as string;
  const item = await assertProjectWorkItem(householdId, id);
  await prisma.projectWorkItem.delete({ where: { id } });
  await touchProject(item.projectId);
  revalidateProjectPaths(item.projectId);
}

export async function reorderWorkItems(input: {
  projectId: string;
  itemId: string;
  toStatus: WorkItemStatus;
  orderedIdsByStatus: Record<WorkItemStatus, string[]>;
}) {
  const { householdId } = await requireMutationAccess(ModuleId.TASKS);
  const { projectId, itemId, toStatus, orderedIdsByStatus } = input;
  if (!isWorkItemStatus(toStatus)) throw new Error("Invalid work item status");
  await assertProject(householdId, projectId);
  await assertProjectWorkItem(householdId, itemId);

  const allIds = [
    ...orderedIdsByStatus.backlog,
    ...orderedIdsByStatus.in_progress,
    ...orderedIdsByStatus.done,
  ];
  const owned = await prisma.projectWorkItem.findMany({
    where: { projectId, project: { householdId } },
    select: { id: true },
  });
  const ownedSet = new Set(owned.map((row) => row.id));
  if (allIds.some((id) => !ownedSet.has(id)) || !ownedSet.has(itemId)) {
    throw new Error("Invalid work item reorder");
  }

  await prisma.$transaction(async (tx) => {
    for (const status of ["backlog", "in_progress", "done"] as const) {
      const ids = orderedIdsByStatus[status] ?? [];
      for (let order = 0; order < ids.length; order++) {
        await tx.projectWorkItem.update({
          where: { id: ids[order] },
          data: { status, order },
        });
      }
    }
    await tx.project.update({
      where: { id: projectId },
      data: { updatedAt: new Date() },
    });
  });

  revalidateProjectPaths(projectId);
}

export async function addProjectUpdate(formData: FormData) {
  const { householdId, userId } = await requireMutationAccess(ModuleId.TASKS);
  const projectId = formData.get("projectId") as string;
  const comment = (formData.get("comment") as string)?.trim();
  if (!comment) throw new Error("Comment is required");
  const photo = formData.get("photo") as File | null;
  await assertProject(householdId, projectId);

  let photoUrl: string | undefined;
  if (photo && photo.size > 0) {
    photoUrl = (await saveUpload(photo, { householdId, subdir: "projects" })).url;
  }

  const update = await prisma.projectUpdate.create({
    data: { projectId, userId, comment, photoUrl },
    include: { user: { select: userNameSelect } },
  });
  await touchProject(projectId);
  revalidateProjectPaths(projectId);
  return {
    id: update.id,
    comment: update.comment,
    photoUrl: update.photoUrl,
    createdAt: update.createdAt,
    user: update.user,
  };
}

export async function uploadProjectFile(formData: FormData) {
  const { householdId, userId } = await requireMutationAccess(ModuleId.TASKS);
  const projectId = formData.get("projectId") as string;
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) throw new Error("File is required");
  await assertProject(householdId, projectId);

  const saved = await saveUpload(file, {
    householdId,
    subdir: "projects/files",
  });

  const created = await prisma.projectFile.create({
    data: {
      projectId,
      userId,
      originalName: saved.originalName,
      mimeType: saved.mimeType,
      sizeBytes: saved.sizeBytes,
      url: saved.url,
    },
    include: { user: { select: userNameSelect } },
  });
  await touchProject(projectId);
  revalidateProjectPaths(projectId);
  return {
    id: created.id,
    originalName: created.originalName,
    mimeType: created.mimeType,
    sizeBytes: created.sizeBytes,
    url: created.url,
    createdAt: created.createdAt,
    user: created.user,
  };
}

export async function deleteProjectFile(formData: FormData) {
  const { householdId } = await requireMutationAccess(ModuleId.TASKS);
  const id = formData.get("id") as string;
  const file = await assertProjectFile(householdId, id);
  await prisma.projectFile.delete({ where: { id } });
  await deleteUploadsByUrls([file.url]);
  await touchProject(file.projectId);
  revalidateProjectPaths(file.projectId);
}

export async function addVisionPin(formData: FormData) {
  const { householdId } = await requireMutationAccess(ModuleId.TASKS);
  const projectId = formData.get("projectId") as string;
  const kind = formData.get("kind") as string;
  if (!isVisionPinKind(kind)) throw new Error("Invalid pin kind");
  await assertProject(householdId, projectId);

  const maxZ = await prisma.projectVisionPin.aggregate({
    where: { projectId },
    _max: { zIndex: true },
  });
  const zIndex = (maxZ._max.zIndex ?? -1) + 1;
  const xPct = clampPct(parseFloat((formData.get("xPct") as string) || "12"));
  const yPct = clampPct(parseFloat((formData.get("yPct") as string) || "12"));

  let pin;
  if (kind === "text") {
    const body = (formData.get("body") as string)?.trim();
    if (!body) throw new Error("Pin text is required");
    pin = await prisma.projectVisionPin.create({
      data: { projectId, kind, body, xPct, yPct, zIndex },
    });
  } else {
    const image = formData.get("image") as File | null;
    if (!image || image.size === 0) throw new Error("Image is required");
    const saved = await saveUpload(image, {
      householdId,
      subdir: "projects/vision",
    });
    pin = await prisma.projectVisionPin.create({
      data: {
        projectId,
        kind,
        imageUrl: saved.url,
        body: ((formData.get("body") as string) || "").trim() || null,
        xPct,
        yPct,
        zIndex,
      },
    });
  }

  await touchProject(projectId);
  revalidateProjectPaths(projectId);
  return visionPinDto(pin);
}

export async function moveVisionPin(input: {
  pinId: string;
  xPct: number;
  yPct: number;
}) {
  const { householdId } = await requireMutationAccess(ModuleId.TASKS);
  const pin = await assertProjectVisionPin(householdId, input.pinId);
  await prisma.projectVisionPin.update({
    where: { id: input.pinId },
    data: {
      xPct: clampPct(input.xPct),
      yPct: clampPct(input.yPct),
    },
  });
  await touchProject(pin.projectId);
  revalidateProjectPaths(pin.projectId);
}

export async function resizeVisionPin(input: {
  pinId: string;
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
}) {
  const { householdId } = await requireMutationAccess(ModuleId.TASKS);
  const pin = await assertProjectVisionPin(householdId, input.pinId);
  await prisma.projectVisionPin.update({
    where: { id: input.pinId },
    data: {
      xPct: clampPct(input.xPct),
      yPct: clampPct(input.yPct),
      wPct: clampPinSizePct(input.wPct),
      hPct: clampPinSizePct(input.hPct),
    },
  });
  await touchProject(pin.projectId);
  revalidateProjectPaths(pin.projectId);
}

export async function createVisionPinLink(input: {
  pinAId: string;
  pinBId: string;
}) {
  const { householdId } = await requireMutationAccess(ModuleId.TASKS);
  if (input.pinAId === input.pinBId) {
    throw new Error("Cannot link a pin to itself");
  }
  const pinA = await assertProjectVisionPin(householdId, input.pinAId);
  const pinB = await assertProjectVisionPin(householdId, input.pinBId);
  if (pinA.projectId !== pinB.projectId) {
    throw new Error("Pins must belong to the same project");
  }
  const [fromPinId, toPinId] = normalizePinLinkIds(input.pinAId, input.pinBId);
  const existing = await prisma.projectVisionPinLink.findUnique({
    where: { fromPinId_toPinId: { fromPinId, toPinId } },
  });
  if (existing) {
    return {
      id: existing.id,
      projectId: existing.projectId,
      fromPinId: existing.fromPinId,
      toPinId: existing.toPinId,
    };
  }
  const link = await prisma.projectVisionPinLink.create({
    data: {
      projectId: pinA.projectId,
      fromPinId,
      toPinId,
    },
  });
  await touchProject(pinA.projectId);
  revalidateProjectPaths(pinA.projectId);
  return {
    id: link.id,
    projectId: link.projectId,
    fromPinId: link.fromPinId,
    toPinId: link.toPinId,
  };
}

export async function deleteVisionPinLink(formData: FormData) {
  const { householdId } = await requireMutationAccess(ModuleId.TASKS);
  const id = formData.get("id") as string;
  if (!id) return;
  const link = await assertProjectVisionPinLink(householdId, id);
  await prisma.projectVisionPinLink.delete({ where: { id } });
  await touchProject(link.projectId);
  revalidateProjectPaths(link.projectId);
}

export async function deleteVisionPin(formData: FormData) {
  const { householdId } = await requireMutationAccess(ModuleId.TASKS);
  const id = formData.get("id") as string;
  const pin = await assertProjectVisionPin(householdId, id);
  await prisma.projectVisionPin.delete({ where: { id } });
  await deleteUploadsByUrls([pin.imageUrl]);
  await touchProject(pin.projectId);
  revalidateProjectPaths(pin.projectId);
}

export async function deleteChore(formData: FormData) {
  const { householdId } = await requireMutationAccess(ModuleId.TASKS);
  const id = formData.get("id") as string;
  if (!id) return;
  await assertChore(householdId, id);
  await prisma.chore.delete({ where: { id } });
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
}

export async function deleteProject(formData: FormData) {
  const { householdId } = await requireMutationAccess(ModuleId.TASKS);
  const id = formData.get("id") as string;
  if (!id) return;
  await assertProject(householdId, id);

  const [files, pins, updates] = await Promise.all([
    prisma.projectFile.findMany({ where: { projectId: id }, select: { url: true } }),
    prisma.projectVisionPin.findMany({
      where: { projectId: id },
      select: { imageUrl: true },
    }),
    prisma.projectUpdate.findMany({
      where: { projectId: id },
      select: { photoUrl: true },
    }),
  ]);

  const urls = [
    ...files.map((f) => f.url),
    ...pins.map((p) => p.imageUrl),
    ...updates.map((u) => u.photoUrl),
  ];

  await prisma.project.delete({ where: { id } });
  await deleteUploadsByUrls(urls);
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
