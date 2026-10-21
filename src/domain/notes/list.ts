import { prisma } from "@/core/db";
import { DomainError } from "@/domain/error";
import type { Prisma } from "@prisma/client";
import { noteTypeFromWire, toNoteListItem } from "./map";
import { assertNotesEnabled } from "./module-gate";
import type { ListNotesInput, NoteListItem } from "./types";
import { isNoteTypeWire, NOTE_LIST_CAP } from "./types";

export async function listNotes(
  householdId: string,
  input: ListNotesInput = {},
): Promise<NoteListItem[] | DomainError> {
  const gate = await assertNotesEnabled(householdId);
  if (gate) return gate;

  if (input.type !== undefined && !isNoteTypeWire(input.type)) {
    return DomainError.invalidInput(
      'type must be "note" or "feature_request".',
      "invalid_type",
    );
  }

  const where: Prisma.HouseholdNoteWhereInput = { householdId };
  if (input.type) {
    where.type = noteTypeFromWire(input.type);
  }
  const query = input.query?.trim();
  if (query) {
    where.OR = [
      { title: { contains: query, mode: "insensitive" } },
      { body: { contains: query, mode: "insensitive" } },
    ];
  }

  const rows = await prisma.householdNote.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: NOTE_LIST_CAP,
  });

  return rows.map(toNoteListItem);
}
