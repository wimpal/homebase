import { prisma } from "@/core/db";
import { DomainError } from "@/domain/error";
import { toNoteListItem } from "./map";
import { assertNotesEnabled } from "./module-gate";
import { rejectSecretLikeContent } from "./secrets";
import type { AddNoteInput, NoteListItem } from "./types";
import { NOTE_BODY_MAX, NOTE_TITLE_MAX } from "./types";

export async function addNote(
  householdId: string,
  input: AddNoteInput,
): Promise<NoteListItem | DomainError> {
  const gate = await assertNotesEnabled(householdId);
  if (gate) return gate;

  const body = input.body?.trim() ?? "";
  if (!body) {
    return DomainError.invalidInput("body is required.", "body_required");
  }
  if (body.length > NOTE_BODY_MAX) {
    return DomainError.invalidInput(
      `body must be at most ${NOTE_BODY_MAX} characters.`,
      "body_too_long",
    );
  }

  const titleRaw = input.title?.trim() ?? "";
  const title = titleRaw === "" ? null : titleRaw;
  if (title && title.length > NOTE_TITLE_MAX) {
    return DomainError.invalidInput(
      `title must be at most ${NOTE_TITLE_MAX} characters.`,
      "title_too_long",
    );
  }

  const secret = rejectSecretLikeContent(title, body);
  if (secret) return secret;

  const row = await prisma.householdNote.create({
    data: {
      householdId,
      title,
      body,
    },
  });

  return toNoteListItem(row);
}
