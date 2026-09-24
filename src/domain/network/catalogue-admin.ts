import { prisma } from "@/core/db";
import { DomainError } from "@/domain/error";
import { slugifyLabel } from "./catalogue";
import { ensureNetworkCatalogues } from "./ensure-catalogues";

export type CatalogueType = {
  id: string;
  slug: string;
  name: string;
  isSystem: boolean;
};

export type CatalogueLocation = {
  id: string;
  slug: string;
  name: string;
  isReserved: boolean;
};

export async function listNetworkDeviceTypes(
  householdId: string,
): Promise<CatalogueType[]> {
  await ensureNetworkCatalogues(householdId);
  const rows = await prisma.networkDeviceType.findMany({
    where: { householdId },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    isSystem: r.isSystem,
  }));
}

export async function listDeviceLocations(
  householdId: string,
): Promise<CatalogueLocation[]> {
  await ensureNetworkCatalogues(householdId);
  const rows = await prisma.deviceLocation.findMany({
    where: { householdId },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    isReserved: r.isReserved,
  }));
}

export async function addNetworkDeviceType(
  householdId: string,
  name: string,
): Promise<CatalogueType | DomainError> {
  await ensureNetworkCatalogues(householdId);
  const trimmed = name.trim().slice(0, 80);
  if (!trimmed) {
    return DomainError.invalidInput("Type name is required.", "invalid_name");
  }
  let slug = slugifyLabel(trimmed);
  if (!slug) slug = `type-${Date.now()}`;

  const existing = await prisma.networkDeviceType.findFirst({
    where: {
      householdId,
      OR: [
        { slug: { equals: slug, mode: "insensitive" } },
        { name: { equals: trimmed, mode: "insensitive" } },
      ],
    },
  });
  if (existing) {
    return DomainError.conflict("Type already exists.", "type_conflict");
  }

  // Ensure unique slug if collide with different casing path
  let candidate = slug;
  for (let n = 2; n < 100; n++) {
    const clash = await prisma.networkDeviceType.findFirst({
      where: { householdId, slug: candidate },
      select: { id: true },
    });
    if (!clash) break;
    candidate = `${slug}-${n}`;
  }

  const row = await prisma.networkDeviceType.create({
    data: {
      householdId,
      slug: candidate,
      name: trimmed,
      isSystem: false,
    },
  });
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    isSystem: row.isSystem,
  };
}

export async function addDeviceLocation(
  householdId: string,
  name: string,
): Promise<CatalogueLocation | DomainError> {
  await ensureNetworkCatalogues(householdId);
  const trimmed = name.trim().slice(0, 80);
  if (!trimmed) {
    return DomainError.invalidInput(
      "Location name is required.",
      "invalid_name",
    );
  }
  let slug = slugifyLabel(trimmed);
  if (!slug) slug = `loc-${Date.now()}`;

  const existing = await prisma.deviceLocation.findFirst({
    where: {
      householdId,
      OR: [
        { slug: { equals: slug, mode: "insensitive" } },
        { name: { equals: trimmed, mode: "insensitive" } },
      ],
    },
  });
  if (existing) {
    return DomainError.conflict("Location already exists.", "location_conflict");
  }

  let candidate = slug;
  for (let n = 2; n < 100; n++) {
    const clash = await prisma.deviceLocation.findFirst({
      where: { householdId, slug: candidate },
      select: { id: true },
    });
    if (!clash) break;
    candidate = `${slug}-${n}`;
  }

  const row = await prisma.deviceLocation.create({
    data: {
      householdId,
      slug: candidate,
      name: trimmed,
      isReserved: false,
    },
  });
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    isReserved: row.isReserved,
  };
}

export async function renameDeviceLocation(
  householdId: string,
  id: string,
  name: string,
): Promise<CatalogueLocation | DomainError> {
  await ensureNetworkCatalogues(householdId);
  const trimmed = name.trim().slice(0, 80);
  if (!trimmed) {
    return DomainError.invalidInput(
      "Location name is required.",
      "invalid_name",
    );
  }

  const existing = await prisma.deviceLocation.findFirst({
    where: { id, householdId },
  });
  if (!existing) {
    return DomainError.notFound("Device location not found.", "location_not_found");
  }
  if (existing.isReserved) {
    return DomainError.invalidInput(
      "Reserved locations cannot be renamed.",
      "reserved_location",
    );
  }

  const row = await prisma.deviceLocation.update({
    where: { id },
    data: { name: trimmed },
  });
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    isReserved: row.isReserved,
  };
}
