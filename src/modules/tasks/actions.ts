"use server";

import { prisma } from "@/core/db";
import { requireHousehold, requireMutationAccess } from "@/core/auth/session";
import {
  assertChore,
  assertProjectVisionPin,
} from "@/core/tenancy/assertHouseholdResource";
import { isDomainError } from "@/domain/error";
import {
  type ActionResult,
  failResult,
  fromDomainError,
  okResult,
} from "@/lib/action-result";
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

async function failIfProjectMissing(
  householdId: string,
  projectId: string,
): Promise<ActionResult<never> | null> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, householdId },
    select: { id: true },
  });
  if (!project) {
    return failResult("Project not found", "project_not_found");
  }
  return null;
}

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

export async function createChore(formData: FormData): Promise<ActionResult> {
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
    return fromDomainError(result);
  }
  revalidatePath("/tasks");
  return okResult();
}

export async function completeChore(formData: FormData): Promise<ActionResult> {
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
    return fromDomainError(result);
  }

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  return okResult();
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

export async function createProject(formData: FormData): Promise<ActionResult> {
  const { householdId } = await requireMutationAccess(ModuleId.TASKS);
  const title = (formData.get("title") as string)?.trim();
  if (!title) {
    return failResult("Title is required", "title_required");
  }
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
  return okResult();
}

export async function updateProjectStatus(formData: FormData): Promise<ActionResult> {
  const { householdId } = await requireMutationAccess(ModuleId.TASKS);
  const id = formData.get("id") as string;
  const status = formData.get("status") as string;
  if (!isProjectStatus(status)) {
    return failResult("Invalid project status", "invalid_status");
  }
  const missing = await failIfProjectMissing(householdId, id);
  if (missing) return missing;
  await prisma.project.update({ where: { id }, data: { status } });
  revalidateProjectPaths(id);
  return okResult();
}

export async function updateProjectMeta(formData: FormData): Promise<ActionResult> {
  const { householdId } = await requireMutationAccess(ModuleId.TASKS);
  const id = formData.get("id") as string;
  const title = (formData.get("title") as string)?.trim();
  if (!title) {
    return failResult("Title is required", "title_required");
  }
  const description = ((formData.get("description") as string) || "").trim() || null;
  const missing = await failIfProjectMissing(householdId, id);
  if (missing) return missing;
  await prisma.project.update({ where: { id }, data: { title, description } });
  revalidateProjectPaths(id);
  return okResult();
}

export type ProjectWorkItemRow = {
  id: string;
  title: string;
  notes: string | null;
  status: string;
  order: number;
};

export async function addWorkItem(
  formData: FormData,
): Promise<ActionResult<ProjectWorkItemRow>> {
  const { householdId } = await requireMutationAccess(ModuleId.TASKS);
  const projectId = formData.get("projectId") as string;
  const title = (formData.get("title") as string)?.trim();
  if (!title) {
    return failResult("Title is required", "title_required");
  }
  const notes = ((formData.get("notes") as string) || "").trim() || null;
  const statusRaw = (formData.get("status") as string) || "backlog";
  if (!isWorkItemStatus(statusRaw)) {
    return failResult("Invalid work item status", "invalid_status");
  }
  const missing = await failIfProjectMissing(householdId, projectId);
  if (missing) return missing;

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
  return okResult({
    id: item.id,
    title: item.title,
    notes: item.notes,
    status: item.status,
    order: item.order,
  });
}

export async function updateWorkItem(formData: FormData): Promise<ActionResult> {
  const { householdId } = await requireMutationAccess(ModuleId.TASKS);
  const id = formData.get("id") as string;
  const title = (formData.get("title") as string)?.trim();
  if (!title) {
    return failResult("Title is required", "title_required");
  }
  const notes = ((formData.get("notes") as string) || "").trim() || null;
  const item = await prisma.projectWorkItem.findFirst({
    where: { id, project: { householdId } },
  });
  if (!item) {
    return failResult("Project not found", "project_not_found");
  }
  await prisma.projectWorkItem.update({
    where: { id },
    data: { title, notes },
  });
  await touchProject(item.projectId);
  revalidateProjectPaths(item.projectId);
  return okResult();
}

export async function deleteWorkItem(formData: FormData): Promise<ActionResult> {
  const { householdId } = await requireMutationAccess(ModuleId.TASKS);
  const id = formData.get("id") as string;
  if (!id) return okResult();
  const item = await prisma.projectWorkItem.findFirst({
    where: { id, project: { householdId } },
  });
  if (!item) {
    return failResult("Project not found", "project_not_found");
  }
  await prisma.projectWorkItem.delete({ where: { id } });
  await touchProject(item.projectId);
  revalidateProjectPaths(item.projectId);
  return okResult();
}

export async function reorderWorkItems(input: {
  projectId: string;
  itemId: string;
  toStatus: WorkItemStatus;
  orderedIdsByStatus: Record<WorkItemStatus, string[]>;
}): Promise<ActionResult> {
  const { householdId } = await requireMutationAccess(ModuleId.TASKS);
  const { projectId, itemId, toStatus, orderedIdsByStatus } = input;
  if (!isWorkItemStatus(toStatus)) {
    return failResult("Invalid work item status", "invalid_status");
  }
  const missing = await failIfProjectMissing(householdId, projectId);
  if (missing) return missing;

  const item = await prisma.projectWorkItem.findFirst({
    where: { id: itemId, project: { householdId, id: projectId } },
    select: { id: true },
  });
  if (!item) {
    return failResult("Project not found", "project_not_found");
  }

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
    return failResult("Invalid work item reorder", "invalid_status");
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
  return okResult();
}

export type ProjectUpdateRow = {
  id: string;
  comment: string;
  photoUrl: string | null;
  createdAt: Date;
  user: { id: string; name: string | null } | null;
};

export async function addProjectUpdate(
  formData: FormData,
): Promise<ActionResult<ProjectUpdateRow>> {
  const { householdId, userId } = await requireMutationAccess(ModuleId.TASKS);
  const projectId = formData.get("projectId") as string;
  const comment = (formData.get("comment") as string)?.trim();
  if (!comment) {
    return failResult("Comment is required", "comment_required");
  }
  const photo = formData.get("photo") as File | null;
  const missing = await failIfProjectMissing(householdId, projectId);
  if (missing) return missing;

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
  return okResult({
    id: update.id,
    comment: update.comment,
    photoUrl: update.photoUrl,
    createdAt: update.createdAt,
    user: update.user,
  });
}

export type ProjectFileCreated = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  createdAt: Date;
  user: { id: string; name: string | null } | null;
};

export async function uploadProjectFile(
  formData: FormData,
): Promise<ActionResult<ProjectFileCreated>> {
  const { householdId, userId } = await requireMutationAccess(ModuleId.TASKS);
  const projectId = formData.get("projectId") as string;
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    return failResult("File is required", "file_required");
  }
  const missing = await failIfProjectMissing(householdId, projectId);
  if (missing) return missing;

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
  return okResult({
    id: created.id,
    originalName: created.originalName,
    mimeType: created.mimeType,
    sizeBytes: created.sizeBytes,
    url: created.url,
    createdAt: created.createdAt,
    user: created.user,
  });
}

export async function deleteProjectFile(formData: FormData): Promise<ActionResult> {
  const { householdId } = await requireMutationAccess(ModuleId.TASKS);
  const id = formData.get("id") as string;
  if (!id) return okResult();
  const file = await prisma.projectFile.findFirst({
    where: { id, project: { householdId } },
  });
  if (!file) {
    return failResult("Project not found", "project_not_found");
  }
  await prisma.projectFile.delete({ where: { id } });
  await deleteUploadsByUrls([file.url]);
  await touchProject(file.projectId);
  revalidateProjectPaths(file.projectId);
  return okResult();
}

export async function addVisionPin(
  formData: FormData,
): Promise<ActionResult<ReturnType<typeof visionPinDto>>> {
  const { householdId } = await requireMutationAccess(ModuleId.TASKS);
  const projectId = formData.get("projectId") as string;
  const kind = formData.get("kind") as string;
  if (!isVisionPinKind(kind)) {
    return failResult("Invalid pin kind", "invalid_pin");
  }
  const missing = await failIfProjectMissing(householdId, projectId);
  if (missing) return missing;

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
    if (!body) {
      return failResult("Pin text is required", "invalid_pin");
    }
    pin = await prisma.projectVisionPin.create({
      data: { projectId, kind, body, xPct, yPct, zIndex },
    });
  } else {
    const image = formData.get("image") as File | null;
    if (!image || image.size === 0) {
      return failResult("Image is required", "invalid_pin");
    }
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
  return okResult(visionPinDto(pin));
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

export type VisionPinLinkCreated = {
  id: string;
  projectId: string;
  fromPinId: string;
  toPinId: string;
};

export async function createVisionPinLink(input: {
  pinAId: string;
  pinBId: string;
}): Promise<ActionResult<VisionPinLinkCreated>> {
  const { householdId } = await requireMutationAccess(ModuleId.TASKS);
  if (input.pinAId === input.pinBId) {
    return failResult("Cannot link a pin to itself", "invalid_pin_link");
  }
  const pinA = await prisma.projectVisionPin.findFirst({
    where: { id: input.pinAId, project: { householdId } },
  });
  const pinB = await prisma.projectVisionPin.findFirst({
    where: { id: input.pinBId, project: { householdId } },
  });
  if (!pinA || !pinB) {
    return failResult("Project not found", "project_not_found");
  }
  if (pinA.projectId !== pinB.projectId) {
    return failResult(
      "Pins must belong to the same project",
      "invalid_pin_link",
    );
  }
  const [fromPinId, toPinId] = normalizePinLinkIds(input.pinAId, input.pinBId);
  const existing = await prisma.projectVisionPinLink.findUnique({
    where: { fromPinId_toPinId: { fromPinId, toPinId } },
  });
  if (existing) {
    return okResult({
      id: existing.id,
      projectId: existing.projectId,
      fromPinId: existing.fromPinId,
      toPinId: existing.toPinId,
    });
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
  return okResult({
    id: link.id,
    projectId: link.projectId,
    fromPinId: link.fromPinId,
    toPinId: link.toPinId,
  });
}

export async function deleteVisionPinLink(formData: FormData): Promise<ActionResult> {
  const { householdId } = await requireMutationAccess(ModuleId.TASKS);
  const id = formData.get("id") as string;
  if (!id) return okResult();
  const link = await prisma.projectVisionPinLink.findFirst({
    where: { id, project: { householdId } },
  });
  if (!link) {
    return failResult("Project not found", "project_not_found");
  }
  await prisma.projectVisionPinLink.delete({ where: { id } });
  await touchProject(link.projectId);
  revalidateProjectPaths(link.projectId);
  return okResult();
}

export async function deleteVisionPin(formData: FormData): Promise<ActionResult> {
  const { householdId } = await requireMutationAccess(ModuleId.TASKS);
  const id = formData.get("id") as string;
  if (!id) return okResult();
  const pin = await prisma.projectVisionPin.findFirst({
    where: { id, project: { householdId } },
  });
  if (!pin) {
    return failResult("Project not found", "project_not_found");
  }
  await prisma.projectVisionPin.delete({ where: { id } });
  await deleteUploadsByUrls([pin.imageUrl]);
  await touchProject(pin.projectId);
  revalidateProjectPaths(pin.projectId);
  return okResult();
}

export async function deleteChore(formData: FormData): Promise<ActionResult> {
  const { householdId } = await requireMutationAccess(ModuleId.TASKS);
  const id = formData.get("id") as string;
  if (!id) return okResult();
  const existing = await prisma.chore.findFirst({
    where: { id, householdId },
    select: { id: true },
  });
  if (!existing) {
    return failResult("Chore not found.", "chore_not_found");
  }
  await prisma.chore.delete({ where: { id } });
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  return okResult();
}

export async function deleteProject(formData: FormData): Promise<ActionResult> {
  const { householdId } = await requireMutationAccess(ModuleId.TASKS);
  const id = formData.get("id") as string;
  if (!id) return okResult();
  const missing = await failIfProjectMissing(householdId, id);
  if (missing) return missing;

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
  return okResult();
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
