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
import type { AddNetworkDeviceInput, NetworkDeviceDetail } from "./types";

export async function addNetworkDevice(
  householdId: string,
  input: AddNetworkDeviceInput,
): Promise<NetworkDeviceDetail | DomainError> {
  const gated = await assertHomeNetworkEnabled(householdId);
  if (gated) return gated;
  await ensureNetworkCatalogues(householdId);

  const nameRaw = (input.name ?? "").trim();
  if (!nameRaw) {
    return DomainError.invalidInput("Name is required.", "invalid_name");
  }
  if (nameRaw.length > 200) {
    return DomainError.invalidInput("Name is too long.", "name_too_long");
  }

  const type = await resolveType(householdId, input.type);
  if (type instanceof DomainError) return type;
  const location = await resolveLocation(householdId, input.location);
  if (location instanceof DomainError) return location;

  const mac = normalizeMacAddress(input.mac_address);
  if (isDomainError(mac)) return mac;
  if (mac) {
    const clash = await prisma.networkDevice.findFirst({
      where: { householdId, macAddress: mac },
      select: { id: true },
    });
    if (clash) {
      return DomainError.conflict(
        "A device with this MAC already exists.",
        "mac_conflict",
      );
    }
  }

  const lastSeenIp = normalizeIp(input.last_seen_ip);
  const lastSeenHostname = normalizeHostname(input.last_seen_hostname);
  const hasSeen =
    lastSeenIp != null || lastSeenHostname != null || mac != null;

  let wakeAllowed = false;
  if (input.wake_allowed) {
    if (!mac) {
      return DomainError.invalidInput(
        "MAC address is required to enable wake allowlist.",
        "wake_requires_mac",
      );
    }
    wakeAllowed = true;
  }

  const name = await allocateUniqueName(householdId, nameRaw);
  const notes = input.notes?.trim() || null;

  const row = await prisma.networkDevice.create({
    data: {
      householdId,
      name,
      typeId: type.id,
      locationId: location.id,
      notes,
      macAddress: mac,
      wakeAllowed,
      lastSeenIp,
      lastSeenHostname,
      lastSeenAt: hasSeen ? new Date() : null,
    },
    include: { type: true, location: true },
  });

  return toNetworkDeviceDetail(row);
}
