import { prisma } from "@/core/db";
import { DomainError } from "@/domain/error";
import { ensureNetworkCatalogues } from "./ensure-catalogues";
import { toNetworkDeviceDetail } from "./map";
import { assertHomeNetworkEnabled } from "./module-gate";
import { allocateUniqueName } from "./resolve";
import type { NetworkDeviceDetail } from "./types";

export async function retireNetworkDevice(
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

  const existing = await prisma.networkDevice.findFirst({
    where: { id: trimmed, householdId },
    include: { type: true, location: true },
  });
  if (!existing) {
    return DomainError.notFound("Network device not found.", "device_not_found");
  }

  if (existing.retiredAt) {
    return toNetworkDeviceDetail(existing);
  }

  const row = await prisma.networkDevice.update({
    where: { id: trimmed },
    data: { retiredAt: new Date() },
    include: { type: true, location: true },
  });
  return toNetworkDeviceDetail(row);
}

export async function restoreNetworkDevice(
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

  const existing = await prisma.networkDevice.findFirst({
    where: { id: trimmed, householdId },
  });
  if (!existing) {
    return DomainError.notFound("Network device not found.", "device_not_found");
  }

  const name = await allocateUniqueName(householdId, existing.name, trimmed);

  const row = await prisma.networkDevice.update({
    where: { id: trimmed },
    data: { retiredAt: null, name },
    include: { type: true, location: true },
  });
  return toNetworkDeviceDetail(row);
}
