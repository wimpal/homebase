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

  const name = await allocateUniqueName(householdId, nameRaw);
  const notes = input.notes?.trim() || null;

  const row = await prisma.networkDevice.create({
    data: {
      householdId,
      name,
      typeId: type.id,
      locationId: location.id,
      notes,
    },
    include: { type: true, location: true },
  });

  return toNetworkDeviceDetail(row);
}
