import { prisma } from "@/core/db";
import { DomainError } from "@/domain/error";
import { assertNotesEnabled } from "./module-gate";
import type { RemoveNoteInput, RemoveNoteResult } from "./types";

export async function removeNote(
  householdId: string,
  input: RemoveNoteInput,
): Promise<RemoveNoteResult | DomainError> {
  const gate = await assertNotesEnabled(householdId);
  if (gate) return gate;

  const id = input.id?.trim() ?? "";
  if (!id) {
    return DomainError.invalidInput("id is required.", "note_id_required");
  }

  const existing = await prisma.householdNote.findFirst({
    where: { id, householdId },
    select: { id: true },
  });
  if (!existing) {
    return DomainError.notFound("Note not found.", "note_not_found");
  }

  await prisma.householdNote.delete({ where: { id: existing.id } });
  return { ok: true as const, id: existing.id };
}
