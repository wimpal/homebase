import { prisma } from "@/core/db";
import { DomainError } from "@/domain/error";
import type { DeviceLocation, NetworkDeviceType } from "@prisma/client";

export async function resolveType(
  householdId: string,
  ref: string,
): Promise<NetworkDeviceType | DomainError> {
  const trimmed = ref.trim();
  if (!trimmed) {
    return DomainError.invalidInput("Invalid type.", "invalid_type");
  }
  const byId = await prisma.networkDeviceType.findFirst({
    where: { id: trimmed, householdId },
  });
  if (byId) return byId;
  const bySlug = await prisma.networkDeviceType.findFirst({
    where: {
      householdId,
      slug: { equals: trimmed, mode: "insensitive" },
    },
  });
  if (bySlug) return bySlug;
  return DomainError.invalidInput("Unknown network device type.", "unknown_type");
}

export async function resolveLocation(
  householdId: string,
  ref: string,
): Promise<DeviceLocation | DomainError> {
  const trimmed = ref.trim();
  if (!trimmed) {
    return DomainError.invalidInput("Invalid location.", "invalid_location");
  }
  const byId = await prisma.deviceLocation.findFirst({
    where: { id: trimmed, householdId },
  });
  if (byId) return byId;
  const bySlug = await prisma.deviceLocation.findFirst({
    where: {
      householdId,
      slug: { equals: trimmed, mode: "insensitive" },
    },
  });
  if (bySlug) return bySlug;
  return DomainError.invalidInput(
    "Unknown device location.",
    "unknown_location",
  );
}

/**
 * Allocate a unique active name: Name, Name (2), Name (3), …
 * Case-insensitive among non-retired rows; excludeId skips self on update/restore.
 */
export async function allocateUniqueName(
  householdId: string,
  desired: string,
  excludeId?: string,
): Promise<string> {
  const base = desired.trim().slice(0, 200) || "Device";
  const active = await prisma.networkDevice.findMany({
    where: {
      householdId,
      retiredAt: null,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { name: true },
  });
  const taken = new Set(active.map((r) => r.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;

  for (let n = 2; n < 1000; n++) {
    const candidate = `${base} (${n})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${base} (${Date.now()})`;
}
