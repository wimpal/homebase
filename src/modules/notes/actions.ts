"use server";

import { requireHousehold, requireMutationAccess } from "@/core/auth/session";
import {
  addNote,
  isNoteTypeWire,
  listNotes,
  removeNote,
  type NoteListItem,
  type NoteTypeWire,
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

export async function getNotes(
  type?: NoteTypeWire,
): Promise<NoteListItem[]> {
  const { householdId } = await requireHousehold();
  const result = await listNotes(householdId, type ? { type } : {});
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
  const typeRaw = String(formData.get("type") ?? "").trim();
  const type = isNoteTypeWire(typeRaw) ? typeRaw : undefined;

  const result = await addNote(householdId, { body, title, type });
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
