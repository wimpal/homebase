import { ModuleId } from "@prisma/client";
import { isModuleEnabled } from "@/core/modules/settings";
import { DomainError } from "@/domain/error";

export async function assertProtocolsEnabled(
  householdId: string,
): Promise<DomainError | null> {
  const enabled = await isModuleEnabled(householdId, ModuleId.PROTOCOLS);
  if (!enabled) {
    return DomainError.unavailable(
      "Protocols module is disabled.",
      "module_disabled",
    );
  }
  return null;
}
