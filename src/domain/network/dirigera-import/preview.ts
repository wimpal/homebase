import { prisma } from "@/core/db";
import { DomainError } from "@/domain/error";
import { ensureNetworkCatalogues } from "../ensure-catalogues";
import { assertHomeNetworkEnabled } from "../module-gate";
import { listDirigeraHubDevices } from "./list-hub-devices";
import { mapDirigeraToNetworkTypeSlug } from "./map-type";
import { buildLocationIndex, matchRoomLocation, UNKNOWN_LOCATION_SLUG } from "./locations";
import type {
  DirigeraImportCandidate,
  DirigeraImportLocationStatus,
  DirigeraImportPreview,
} from "./types";

/**
 * Build the Dirigera import preview for the ADMIN confirm panel.
 * Read-only - never writes.
 */
export async function previewDirigeraImport(
  householdId: string,
): Promise<DirigeraImportPreview | DomainError> {
  const gated = await assertHomeNetworkEnabled(householdId);
  if (gated) return gated;
  await ensureNetworkCatalogues(householdId);

  const hub = await listDirigeraHubDevices();
  if (hub instanceof DomainError) return hub;

  const [linked, locations] = await Promise.all([
    prisma.networkDevice.findMany({
      where: { householdId, dirigeraId: { not: null } },
      select: { id: true, dirigeraId: true, retiredAt: true },
    }),
    prisma.deviceLocation.findMany({
      where: { householdId },
      select: { id: true, slug: true, name: true },
    }),
  ]);

  const linkedByHubId = new Map(
    linked.map((row) => [row.dirigeraId as string, row]),
  );
  const locationIndex = buildLocationIndex(locations);

  const candidates: DirigeraImportCandidate[] = hub.map((device) => {
    const linkedRow = linkedByHubId.get(device.id);
    const status = linkedRow
      ? linkedRow.retiredAt
        ? "retired_match"
        : "already_enrolled"
      : "new";

    const room = device.roomName?.trim();
    const matched = matchRoomLocation(locationIndex, room);
    let locationSlug = UNKNOWN_LOCATION_SLUG;
    let locationStatus: DirigeraImportLocationStatus = "none";
    if (matched) {
      locationSlug = matched.slug;
      locationStatus = "matched";
    } else if (room) {
      locationStatus = "missing";
    }

    const candidate: DirigeraImportCandidate = {
      dirigeraId: device.id,
      name: device.name,
      deviceType: device.deviceType,
      typeSlug: mapDirigeraToNetworkTypeSlug(device),
      locationSlug,
      locationStatus,
      status,
    };
    if (room) candidate.roomName = room;
    if (linkedRow) candidate.existingDeviceId = linkedRow.id;
    return candidate;
  });

  return { candidates };
}
