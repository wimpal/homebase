import { ModuleId } from "@prisma/client";
import { isModuleEnabled } from "@/core/modules/settings";
import { DomainError } from "@/domain/error";

export async function assertHouseManualEnabled(
  householdId: string,
): Promise<DomainError | null> {
  const enabled = await isModuleEnabled(householdId, ModuleId.HOUSE_MANUAL);
  if (!enabled) {
    return DomainError.unavailable(
      "House manual module is disabled.",
      "module_disabled",
    );
  }
  return null;
}
