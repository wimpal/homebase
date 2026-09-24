import { prisma } from "@/core/db";
import { DomainError } from "@/domain/error";
import { ensureNetworkCatalogues } from "./ensure-catalogues";
import { toNetworkDeviceDetail } from "./map";
import { assertHomeNetworkEnabled } from "./module-gate";
import type { ListNetworkDevicesInput, NetworkDeviceUiRow } from "./types";
import { resolveLocation, resolveType } from "./resolve";

/** UI-only list including identity fields (never use for MCP). */
export async function listNetworkDevicesForUi(
  householdId: string,
  input: ListNetworkDevicesInput = {},
): Promise<NetworkDeviceUiRow[] | DomainError> {
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
    include: { type: true, location: true },
    orderBy: { name: "asc" },
    take: 200,
  });

  return rows.map((row) => {
    const detail = toNetworkDeviceDetail(row) as NetworkDeviceUiRow;
    if (row.macAddress) detail.mac_address = row.macAddress;
    if (row.lastSeenIp) detail.last_seen_ip = row.lastSeenIp;
    if (row.lastSeenHostname) detail.last_seen_hostname = row.lastSeenHostname;
    return detail;
  });
}
