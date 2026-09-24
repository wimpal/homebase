import { prisma } from "@/core/db";
import {
  RESERVED_DEVICE_LOCATIONS,
  SYSTEM_NETWORK_DEVICE_TYPES,
} from "./catalogue";

/**
 * Idempotent seed of system types + reserved locations for a household.
 */
export async function ensureNetworkCatalogues(householdId: string): Promise<void> {
  await Promise.all([
    ...SYSTEM_NETWORK_DEVICE_TYPES.map((t) =>
      prisma.networkDeviceType.upsert({
        where: {
          householdId_slug: { householdId, slug: t.slug },
        },
        create: {
          householdId,
          slug: t.slug,
          name: t.name,
          isSystem: true,
        },
        update: {},
      }),
    ),
    ...RESERVED_DEVICE_LOCATIONS.map((loc) =>
      prisma.deviceLocation.upsert({
        where: {
          householdId_slug: { householdId, slug: loc.slug },
        },
        create: {
          householdId,
          slug: loc.slug,
          name: loc.name,
          isReserved: true,
        },
        update: {},
      }),
    ),
  ]);
}
