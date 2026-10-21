import { requireHousehold } from "@/core/auth/session";
import { requireModule } from "@/core/modules/guard";
import { isNoteTypeWire, type NoteTypeWire } from "@/domain/notes";
import { getNotes } from "@/modules/notes/actions";
import { ModuleId } from "@prisma/client";
import { NotesClient } from "./NotesClient";

export default async function NotesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { householdId, role } = await requireHousehold();
  await requireModule(householdId, ModuleId.NOTES);
  const params = await searchParams;
  const typeFilter: NoteTypeWire | undefined = isNoteTypeWire(params.type)
    ? params.type
    : undefined;
  const notes = await getNotes(typeFilter);
  const canMutate = role !== "GUEST";

  return (
    <NotesClient
      notes={notes}
      canMutate={canMutate}
      activeType={typeFilter ?? "all"}
    />
  );
}
