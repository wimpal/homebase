import type { Prisma } from "@prisma/client";
import { prisma } from "@/core/db";
import { DomainError } from "@/domain/error";
import { ensureNetworkCatalogues } from "../ensure-catalogues";
import { assertHomeNetworkEnabled } from "../module-gate";
import { listDirigeraHubDevices } from "./list-hub-devices";
import { mapDirigeraToNetworkTypeSlug } from "./map-type";
import { buildLocationIndex, resolveImportLocation } from "./locations";
import type {
  ConfirmDirigeraImportInput,
  ConfirmDirigeraImportSummary,
} from "./types";

const MAX_SELECTION = 500;

function isUniqueConflict(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "P2002"
  );
}

/** Unique active name, allocated inside the create transaction. */
async function allocateUniqueNameInTx(
  tx: Prisma.TransactionClient,
  householdId: string,
  desired: string,
): Promise<string> {
  const base = desired.trim().slice(0, 200) || "Device";
  const active = await tx.networkDevice.findMany({
    where: { householdId, retiredAt: null },
    select: { name: true },
  });
  const taken = new Set(active.map((row) => row.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;

  for (let n = 2; n < 1000; n++) {
    const candidate = `${base} (${n})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${base} (${Date.now()})`;
}

/**
 * Confirm a Dirigera import: create NetworkDevice rows for the selected live
 * hub ids. Names/types/rooms are always recomputed from the hub; client input
 * is only the id whitelist (+ optional location creation flag).
 */
export async function confirmDirigeraImport(
  householdId: string,
  input: ConfirmDirigeraImportInput,
): Promise<ConfirmDirigeraImportSummary | DomainError> {
  const gated = await assertHomeNetworkEnabled(householdId);
  if (gated) return gated;
  await ensureNetworkCatalogues(householdId);

  const selected = Array.isArray(input.selectedDirigeraIds)
    ? [
        ...new Set(
          input.selectedDirigeraIds.map((id) => id.trim()).filter(Boolean),
        ),
      ]
    : [];
  if (selected.length === 0) {
    return DomainError.invalidInput(
      "Select at least one Dirigera device.",
      "no_selection",
    );
  }
  if (selected.length > MAX_SELECTION) {
    return DomainError.invalidInput(
      `Too many devices selected (max ${MAX_SELECTION}).`,
      "too_many_selected",
    );
  }

  const hub = await listDirigeraHubDevices();
  if (hub instanceof DomainError) return hub;

  const wanted = new Set(selected);
  const live = hub.filter((device) => wanted.has(device.id));

  const summary: ConfirmDirigeraImportSummary = {
    created: 0,
    skipped_enrolled: 0,
    skipped_retired: 0,
    skipped_missing_on_hub: selected.length - live.length,
    locations_created: 0,
    failed: [],
  };

  const [linked, locations, types] = await Promise.all([
    live.length
      ? prisma.networkDevice.findMany({
          where: { householdId, dirigeraId: { in: live.map((d) => d.id) } },
          select: { id: true, dirigeraId: true, retiredAt: true },
        })
      : Promise.resolve([]),
    prisma.deviceLocation.findMany({
      where: { householdId },
      select: { id: true, slug: true, name: true },
    }),
    prisma.networkDeviceType.findMany({ where: { householdId } }),
  ]);

  const linkedByHubId = new Map(
    linked.map((row) => [row.dirigeraId as string, row]),
  );
  const typeBySlug = new Map(types.map((type) => [type.slug, type]));
  const locationIndex = buildLocationIndex(locations);

  for (const device of live) {
    const existing = linkedByHubId.get(device.id);
    if (existing) {
      if (existing.retiredAt) {
        summary.skipped_retired += 1;
      } else {
        summary.skipped_enrolled += 1;
      }
      continue;
    }

    const type = typeBySlug.get(mapDirigeraToNetworkTypeSlug(device));
    if (!type) {
      summary.failed.push({
        dirigeraId: device.id,
        message: "No matching network device type.",
      });
      continue;
    }

    let resolvedLocation: { id: string; created: boolean } | null = null;
    try {
      resolvedLocation = await resolveImportLocation(
        householdId,
        device.roomName,
        input.createMissingLocations,
        locationIndex,
      );
    } catch (err) {
      summary.failed.push({
        dirigeraId: device.id,
        message: err instanceof Error ? err.message : "Location lookup failed.",
      });
      continue;
    }
    if (!resolvedLocation) {
      summary.failed.push({
        dirigeraId: device.id,
        message: "No device location available.",
      });
      continue;
    }
    if (resolvedLocation.created) summary.locations_created += 1;
    const locationId = resolvedLocation.id;

    try {
      await prisma.$transaction(async (tx) => {
        const name = await allocateUniqueNameInTx(tx, householdId, device.name);
        await tx.networkDevice.create({
          data: {
            householdId,
            name,
            typeId: type.id,
            locationId,
            dirigeraId: device.id,
          },
        });
      });
      summary.created += 1;
    } catch (err) {
      if (isUniqueConflict(err)) {
        // Concurrent double-confirm - idempotent skip.
        summary.skipped_enrolled += 1;
      } else {
        summary.failed.push({
          dirigeraId: device.id,
          message: err instanceof Error ? err.message : "Import failed.",
        });
      }
    }
  }

  return summary;
}
