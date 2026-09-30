import { prisma } from "@/core/db";
import { slugifyLabel } from "../catalogue";

export const UNKNOWN_LOCATION_SLUG = "unknown";

export type DirigeraImportLocationRow = {
  id: string;
  slug: string;
  name: string;
};

export type LocationIndex = Map<string, DirigeraImportLocationRow>;

function isUniqueConflict(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "P2002"
  );
}

export function buildLocationIndex(
  rows: DirigeraImportLocationRow[],
): LocationIndex {
  const index: LocationIndex = new Map();
  for (const row of rows) {
    index.set(row.name.trim().toLowerCase(), row);
    index.set(row.slug.toLowerCase(), row);
  }
  return index;
}

/** Case-insensitive trim match of a Dirigera room name to a Device location. */
export function matchRoomLocation(
  index: LocationIndex,
  room: string | undefined,
): DirigeraImportLocationRow | null {
  const trimmed = room?.trim();
  if (!trimmed) return null;
  const slug = slugifyLabel(trimmed);
  return (
    index.get(trimmed.toLowerCase()) ??
    (slug ? index.get(slug.toLowerCase()) : undefined) ??
    null
  );
}

async function createImportLocation(
  householdId: string,
  room: string,
  index: LocationIndex,
): Promise<DirigeraImportLocationRow | null> {
  const trimmed = room.trim().slice(0, 80);
  if (!trimmed) return null;
  const base = slugifyLabel(trimmed) || `loc-${Date.now()}`;

  for (let n = 1; n < 100; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    try {
      const row = await prisma.deviceLocation.create({
        data: { householdId, slug, name: trimmed, isReserved: false },
      });
      index.set(trimmed.toLowerCase(), row);
      index.set(row.slug.toLowerCase(), row);
      return row;
    } catch (err) {
      if (!isUniqueConflict(err)) throw err;
      const sameName = index.get(trimmed.toLowerCase());
      if (sameName) return sameName;
    }
  }
  return matchRoomLocation(index, room);
}

/**
 * Resolve the Device location for one imported device: matched room, optional
 * ADMIN-confirmed creation, else reserved "unknown".
 */
export async function resolveImportLocation(
  householdId: string,
  room: string | undefined,
  createMissing: boolean,
  index: LocationIndex,
): Promise<{ id: string; created: boolean } | null> {
  const matched = matchRoomLocation(index, room);
  if (matched) return { id: matched.id, created: false };

  if (room?.trim() && createMissing) {
    const created = await createImportLocation(householdId, room, index);
    if (created) return { id: created.id, created: true };
  }

  const unknown =
    index.get(UNKNOWN_LOCATION_SLUG) ??
    (await prisma.deviceLocation.findFirst({
      where: { householdId, slug: UNKNOWN_LOCATION_SLUG },
      select: { id: true, slug: true, name: true },
    }));
  if (unknown) return { id: unknown.id, created: false };

  const fallback = await prisma.deviceLocation.findFirst({
    where: { householdId },
    orderBy: { name: "asc" },
    select: { id: true, slug: true, name: true },
  });
  return fallback ? { id: fallback.id, created: false } : null;
}
