import { prisma } from "@/core/db";
import { DomainError } from "@/domain/error";
import { ensureNetworkCatalogues } from "./ensure-catalogues";
import { toNetworkDeviceDetail } from "./map";
import { assertHomeNetworkEnabled } from "./module-gate";
import type { NetworkDeviceDetail } from "./types";

export async function getNetworkDevice(
  householdId: string,
  id: string,
): Promise<NetworkDeviceDetail | DomainError> {
  const gated = await assertHomeNetworkEnabled(householdId);
  if (gated) return gated;
  await ensureNetworkCatalogues(householdId);

  const trimmed = id.trim();
  if (!trimmed) {
    return DomainError.invalidInput("Invalid network device id.", "invalid_id");
  }

  const row = await prisma.networkDevice.findFirst({
    where: { id: trimmed, householdId },
    include: { type: true, location: true },
  });
  if (!row) {
    return DomainError.notFound("Network device not found.", "device_not_found");
  }
  return toNetworkDeviceDetail(row);
}
