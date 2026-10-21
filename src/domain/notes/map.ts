import type { HouseholdNote, NoteType } from "@prisma/client";
import type { NoteListItem, NoteTypeWire } from "./types";

const PRISMA_TO_WIRE: Record<NoteType, NoteTypeWire> = {
  NOTE: "note",
  FEATURE_REQUEST: "feature_request",
};

const WIRE_TO_PRISMA: Record<NoteTypeWire, NoteType> = {
  note: "NOTE",
  feature_request: "FEATURE_REQUEST",
};

export function noteTypeToWire(type: NoteType): NoteTypeWire {
  return PRISMA_TO_WIRE[type];
}

export function noteTypeFromWire(type: NoteTypeWire): NoteType {
  return WIRE_TO_PRISMA[type];
}

export function toNoteListItem(row: HouseholdNote): NoteListItem {
  const item: NoteListItem = {
    id: row.id,
    body: row.body,
    type: noteTypeToWire(row.type),
    created_at: row.createdAt.toISOString(),
  };
  if (row.title) item.title = row.title;
  return item;
}
