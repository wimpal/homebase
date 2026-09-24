import { prisma } from "@/core/db";
import { DomainError, isDomainError } from "@/domain/error";
import { ensureNetworkCatalogues } from "./ensure-catalogues";
import {
  normalizeHostname,
  normalizeIp,
  normalizeMacAddress,
} from "./identity";
import { toNetworkDeviceDetail } from "./map";
import { assertHomeNetworkEnabled } from "./module-gate";
import {
  allocateUniqueName,
  resolveLocation,
  resolveType,
} from "./resolve";
import type { NetworkDeviceDetail, UpdateNetworkDeviceInput } from "./types";

export async function updateNetworkDevice(
  householdId: string,
  input: UpdateNetworkDeviceInput,
): Promise<NetworkDeviceDetail | DomainError> {
  const gated = await assertHomeNetworkEnabled(householdId);
  if (gated) return gated;
  await ensureNetworkCatalogues(householdId);

  const id = (input.id ?? "").trim();
  if (!id) {
    return DomainError.invalidInput("Invalid network device id.", "invalid_id");
  }

  const existing = await prisma.networkDevice.findFirst({
    where: { id, householdId },
  });
  if (!existing) {
    return DomainError.notFound("Network device not found.", "device_not_found");
  }

  const data: {
    name?: string;
    typeId?: string;
    locationId?: string;
    notes?: string | null;
    macAddress?: string | null;
    wakeAllowed?: boolean;
    lastSeenIp?: string | null;
    lastSeenHostname?: string | null;
    lastSeenAt?: Date | null;
  } = {};

  if (input.name !== undefined) {
    const nameRaw = input.name.trim();
    if (!nameRaw) {
      return DomainError.invalidInput("Name is required.", "invalid_name");
    }
    if (nameRaw.length > 200) {
      return DomainError.invalidInput("Name is too long.", "name_too_long");
    }
    data.name = await allocateUniqueName(householdId, nameRaw, id);
  }

  if (input.type !== undefined) {
    const type = await resolveType(householdId, input.type);
    if (type instanceof DomainError) return type;
    data.typeId = type.id;
  }

  if (input.location !== undefined) {
    const location = await resolveLocation(householdId, input.location);
    if (location instanceof DomainError) return location;
    data.locationId = location.id;
  }

  if (input.notes !== undefined) {
    data.notes = input.notes.trim() || null;
  }

  let touchSeen = false;
  let nextMac: string | null = existing.macAddress;
  let macTouched = false;
  if (input.mac_address !== undefined) {
    const mac = normalizeMacAddress(input.mac_address);
    if (isDomainError(mac)) return mac;
    if (mac) {
      const clash = await prisma.networkDevice.findFirst({
        where: { householdId, macAddress: mac, id: { not: id } },
        select: { id: true },
      });
      if (clash) {
        return DomainError.conflict(
          "A device with this MAC already exists.",
          "mac_conflict",
        );
      }
    }
    data.macAddress = mac;
    nextMac = mac;
    macTouched = true;
    touchSeen = true;
  }
  if (input.last_seen_ip !== undefined) {
    data.lastSeenIp = normalizeIp(input.last_seen_ip);
    touchSeen = true;
  }
  if (input.last_seen_hostname !== undefined) {
    data.lastSeenHostname = normalizeHostname(input.last_seen_hostname);
    touchSeen = true;
  }
  if (touchSeen) {
    data.lastSeenAt = new Date();
  }

  if (input.wake_allowed !== undefined) {
    if (input.wake_allowed && !nextMac) {
      return DomainError.invalidInput(
        "MAC address is required to enable wake allowlist.",
        "wake_requires_mac",
      );
    }
    data.wakeAllowed = Boolean(input.wake_allowed && nextMac);
  } else if (
    macTouched &&
    (!nextMac || nextMac !== existing.macAddress)
  ) {
    // Clearing or changing MAC without an explicit allowlist flag clears it.
    data.wakeAllowed = false;
  }

  const row = await prisma.networkDevice.update({
    where: { id },
    data,
    include: { type: true, location: true },
  });

  return toNetworkDeviceDetail(row);
}
