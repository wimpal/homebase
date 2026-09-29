"use server";

import { requireAdmin, requireHousehold } from "@/core/auth/session";
import { requireModule } from "@/core/modules/guard";
import {
  deleteUploadByUrl,
  saveUpload,
  uploadPathFromUrl,
} from "@/core/uploads/service";
import { isDomainError } from "@/domain/error";
import {
  listHouseManualDocs,
  removeHouseManualDoc,
  setHouseManualSearchable,
  uploadHouseManualDoc,
  type HouseManualDocRecord,
} from "@/domain/house-manual";
import {
  failResult,
  fromDomainError,
  okResult,
  type ActionResult,
} from "@/lib/action-result";
import { ModuleId } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { readFile } from "fs/promises";

export type HouseManualListItem = {
  id: string;
  title: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  searchable: boolean;
  createdAt: string;
};

function toListItem(row: HouseManualDocRecord): HouseManualListItem {
  return {
    id: row.id,
    title: row.title,
    originalName: row.originalName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    url: row.url,
    searchable: row.searchable,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getHouseManualPageData(): Promise<HouseManualListItem[]> {
  const { householdId } = await requireHousehold();
  await requireModule(householdId, ModuleId.HOUSE_MANUAL);
  const rows = await listHouseManualDocs(householdId);
  return rows.map(toListItem);
}

export async function uploadHouseManualAction(
  formData: FormData,
): Promise<ActionResult> {
  const { householdId, userId } = await requireAdmin();
  await requireModule(householdId, ModuleId.HOUSE_MANUAL);

  const title = String(formData.get("title") ?? "").trim();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return failResult("File is required.", "file_required");
  }

  let saved: Awaited<ReturnType<typeof saveUpload>>;
  try {
    saved = await saveUpload(file, {
      householdId,
      subdir: "house-manual",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed.";
    if (message.includes("Unsupported upload type")) {
      return failResult(
        "House manual v1 accepts .txt or .md only.",
        "house_manual_mime_unsupported",
      );
    }
    return failResult(message, "upload_failed");
  }

  if (
    saved.mimeType !== "text/plain" &&
    saved.mimeType !== "text/markdown"
  ) {
    await deleteUploadByUrl(saved.url);
    return failResult(
      "House manual v1 accepts .txt or .md only.",
      "house_manual_mime_unsupported",
    );
  }

  const filepath = uploadPathFromUrl(saved.url);
  if (!filepath) {
    return failResult("Upload path invalid.", "upload_failed");
  }
  const buffer = await readFile(filepath);

  const result = await uploadHouseManualDoc(householdId, {
    title: title || saved.originalName,
    originalName: saved.originalName,
    mimeType: saved.mimeType,
    sizeBytes: saved.sizeBytes,
    url: saved.url,
    buffer,
    uploadedByUserId: userId,
  });
  if (isDomainError(result)) return fromDomainError(result);
  revalidatePath("/house-manual");
  return okResult();
}

export async function setHouseManualSearchableAction(
  formData: FormData,
): Promise<ActionResult> {
  const { householdId } = await requireAdmin();
  await requireModule(householdId, ModuleId.HOUSE_MANUAL);

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return failResult("Document id is required.", "house_manual_id_required");

  const searchableRaw = String(formData.get("searchable") ?? "");
  const searchable = searchableRaw === "true" || searchableRaw === "1";

  const result = await setHouseManualSearchable(householdId, id, searchable);
  if (isDomainError(result)) return fromDomainError(result);
  revalidatePath("/house-manual");
  return okResult();
}

export async function deleteHouseManualAction(
  formData: FormData,
): Promise<ActionResult> {
  const { householdId } = await requireAdmin();
  await requireModule(householdId, ModuleId.HOUSE_MANUAL);

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return failResult("Document id is required.", "house_manual_id_required");

  const result = await removeHouseManualDoc(householdId, id);
  if (isDomainError(result)) return fromDomainError(result);
  revalidatePath("/house-manual");
  return okResult();
}
