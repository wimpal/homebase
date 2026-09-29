export interface NoteListItem {
  id: string;
  title?: string;
  body: string;
  created_at: string;
}

export interface ListNotesInput {
  query?: string;
}

export interface AddNoteInput {
  body: string;
  title?: string;
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
