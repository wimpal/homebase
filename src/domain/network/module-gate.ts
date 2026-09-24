import { ModuleId } from "@prisma/client";
import { isModuleEnabled } from "@/core/modules/settings";
import { DomainError } from "@/domain/error";

export async function assertHomeNetworkEnabled(
  householdId: string,
): Promise<DomainError | null> {
  const enabled = await isModuleEnabled(householdId, ModuleId.HOME_NETWORK);
  if (!enabled) {
    return DomainError.unavailable(
      "Home network module is disabled.",
      "module_disabled",
    );
  }
  return null;
}
