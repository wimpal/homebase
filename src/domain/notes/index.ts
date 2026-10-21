export { addNote } from "./add";
export { listNotes } from "./list";
export { removeNote } from "./remove";
export { assertNotesEnabled } from "./module-gate";
export { rejectSecretLikeContent } from "./secrets";
export type {
  AddNoteInput,
  ListNotesInput,
  NoteListItem,
  NoteTypeWire,
  RemoveNoteInput,
  RemoveNoteResult,
} from "./types";
export {
  isNoteTypeWire,
  NOTE_BODY_MAX,
  NOTE_LIST_CAP,
  NOTE_TITLE_MAX,
  NOTE_TYPE_WIRE_VALUES,
} from "./types";
export { noteTypeFromWire, noteTypeToWire } from "./map";
