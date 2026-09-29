import type { HouseholdNote } from "@prisma/client";
import type { NoteListItem } from "./types";

export function toNoteListItem(row: HouseholdNote): NoteListItem {
  const item: NoteListItem = {
    id: row.id,
    body: row.body,
    created_at: row.createdAt.toISOString(),
  };
  if (row.title) item.title = row.title;
  return item;
}
