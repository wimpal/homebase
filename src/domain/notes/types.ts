/** Wire/MCP note type strings (snake_case). */
export type NoteTypeWire = "note" | "feature_request";

export interface NoteListItem {
  id: string;
  title?: string;
  body: string;
  type: NoteTypeWire;
  created_at: string;
}

export interface ListNotesInput {
  query?: string;
  type?: NoteTypeWire;
}

export interface AddNoteInput {
  body: string;
  title?: string;
  /** Defaults to `note` when omitted. */
  type?: NoteTypeWire;
}

export interface RemoveNoteInput {
  id: string;
}

export interface RemoveNoteResult {
  ok: true;
  id: string;
}

export const NOTE_TITLE_MAX = 200;
export const NOTE_BODY_MAX = 4000;
export const NOTE_LIST_CAP = 50;

export const NOTE_TYPE_WIRE_VALUES = [
  "note",
  "feature_request",
] as const satisfies readonly NoteTypeWire[];

export function isNoteTypeWire(value: unknown): value is NoteTypeWire {
  return (
    typeof value === "string" &&
    (NOTE_TYPE_WIRE_VALUES as readonly string[]).includes(value)
  );
}
