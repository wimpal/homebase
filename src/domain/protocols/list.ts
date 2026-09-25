import { DomainError } from "@/domain/error";
import { assertProtocolsEnabled } from "./module-gate";
import { listSeededProtocols, type ProtocolDefinition } from "./registry";

export async function listProtocols(
  householdId: string,
): Promise<ProtocolDefinition[] | DomainError> {
  const gated = await assertProtocolsEnabled(householdId);
  if (gated) return gated;
  return listSeededProtocols();
}
