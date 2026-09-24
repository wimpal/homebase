import { prisma } from "@/core/db";
import { DomainError } from "@/domain/error";
import { ensureNetworkCatalogues } from "./ensure-catalogues";
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

  const row = await prisma.networkDevice.update({
    where: { id },
    data,
    include: { type: true, location: true },
  });

  return toNetworkDeviceDetail(row);
}
