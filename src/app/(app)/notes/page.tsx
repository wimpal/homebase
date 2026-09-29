import { requireHousehold } from "@/core/auth/session";
import { requireModule } from "@/core/modules/guard";
import { getNotes } from "@/modules/notes/actions";
import { ModuleId } from "@prisma/client";
import { NotesClient } from "./NotesClient";

export default async function NotesPage() {
  const { householdId, role } = await requireHousehold();
  await requireModule(householdId, ModuleId.NOTES);
  const notes = await getNotes();
  const canMutate = role !== "GUEST";

  return <NotesClient notes={notes} canMutate={canMutate} />;
}
