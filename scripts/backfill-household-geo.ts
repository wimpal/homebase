/**
 * Idempotent backfill: set Household lat/long/timezone where coords are null.
 * T-087 / M4d — Zwolle-area defaults; operator may correct in DB later.
 *
 * Usage: npx tsx scripts/backfill-household-geo.ts
 */
import { PrismaClient } from "@prisma/client";

const DEFAULT_LAT = 52.51;
const DEFAULT_LON = 6.09;
const DEFAULT_TZ = "Europe/Amsterdam";

async function main() {
  const prisma = new PrismaClient();
  try {
    const result = await prisma.household.updateMany({
      where: {
        OR: [{ latitude: null }, { longitude: null }],
      },
      data: {
        latitude: DEFAULT_LAT,
        longitude: DEFAULT_LON,
        timezone: DEFAULT_TZ,
      },
    });
    console.log(
      `backfill-household-geo: updated ${result.count} household(s) → ${DEFAULT_LAT}, ${DEFAULT_LON} (${DEFAULT_TZ})`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
