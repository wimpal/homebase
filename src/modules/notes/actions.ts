"use server";

import { requireHousehold, requireMutationAccess } from "@/core/auth/session";
import {
  addNote,
  listNotes,
  removeNote,
  type NoteListItem,
} from "@/domain/notes";
import { isDomainError } from "@/domain/error";
import {
  failResult,
  fromDomainError,
  okResult,
  type ActionResult,
} from "@/lib/action-result";
import { ModuleId } from "@prisma/client";
import { revalidatePath } from "next/cache";

export async function getNotes(): Promise<NoteListItem[]> {
  const { householdId } = await requireHousehold();
  const result = await listNotes(householdId);
  if (isDomainError(result)) return [];
  return result;
}

export async function createNoteAction(
  formData: FormData,
): Promise<ActionResult> {
  const { householdId } = await requireMutationAccess(ModuleId.NOTES);
  const body = String(formData.get("body") ?? "");
  const titleRaw = String(formData.get("title") ?? "").trim();
  const title = titleRaw === "" ? undefined : titleRaw;

  const result = await addNote(householdId, { body, title });
  if (isDomainError(result)) return fromDomainError(result);
  revalidatePath("/notes");
  return okResult();
}

export async function deleteNoteAction(
  formData: FormData,
): Promise<ActionResult> {
  const { householdId } = await requireMutationAccess(ModuleId.NOTES);
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return failResult("Note id is required.", "note_id_required");

  const result = await removeNote(householdId, { id });
  if (isDomainError(result)) return fromDomainError(result);
  revalidatePath("/notes");
  return okResult();
}
