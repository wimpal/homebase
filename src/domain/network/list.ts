import { prisma } from "@/core/db";
import { DomainError } from "@/domain/error";
import { ensureNetworkCatalogues } from "./ensure-catalogues";
import { toNetworkDeviceDetail } from "./map";
import { assertHomeNetworkEnabled } from "./module-gate";
import { resolveLocation, resolveType } from "./resolve";
import type { ListNetworkDevicesInput, NetworkDeviceDetail } from "./types";

const deviceInclude = {
  type: true,
  location: true,
} as const;

export async function listNetworkDevices(
  householdId: string,
  input: ListNetworkDevicesInput = {},
): Promise<NetworkDeviceDetail[] | DomainError> {
  const gated = await assertHomeNetworkEnabled(householdId);
  if (gated) return gated;
  await ensureNetworkCatalogues(householdId);

  const where: {
    householdId: string;
    retiredAt?: null | { not: null };
    typeId?: string;
    locationId?: string;
  } = { householdId };

  if (!input.include_retired) {
    where.retiredAt = null;
  }

  if (input.type?.trim()) {
    const type = await resolveType(householdId, input.type);
    if (type instanceof DomainError) return type;
    where.typeId = type.id;
  }

  if (input.location?.trim()) {
    const location = await resolveLocation(householdId, input.location);
    if (location instanceof DomainError) return location;
    where.locationId = location.id;
  }

  const rows = await prisma.networkDevice.findMany({
    where,
    include: deviceInclude,
    orderBy: { name: "asc" },
    take: 200,
  });

  return rows.map(toNetworkDeviceDetail);
}
