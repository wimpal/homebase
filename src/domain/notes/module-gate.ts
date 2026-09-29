import { ModuleId } from "@prisma/client";
import { isModuleEnabled } from "@/core/modules/settings";
import { DomainError } from "@/domain/error";

export async function assertNotesEnabled(
  householdId: string,
): Promise<DomainError | null> {
  const enabled = await isModuleEnabled(householdId, ModuleId.NOTES);
  if (!enabled) {
    return DomainError.unavailable(
      "Notes module is disabled.",
      "module_disabled",
    );
  }
  return null;
}
