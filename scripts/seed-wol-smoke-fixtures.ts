/**
 * Seed NetworkDevice rows for T-101 mcp-smoke (MAC + wakeAllowed via Prisma —
 * MCP cannot set those). Prints JSON ids to stdout.
 *
 * Usage:
 *   MCP_HOUSEHOLD_ID=… npx tsx scripts/seed-wol-smoke-fixtures.ts
 *   docker compose exec -e MCP_HOUSEHOLD_ID=… worker npx tsx scripts/seed-wol-smoke-fixtures.ts
 */
import { createPrismaClient } from "../src/core/db";
import { ensureNetworkCatalogues } from "../src/domain/network/ensure-catalogues";

function loadDotEnv() {
  if (process.env.HOMEBASE_SMOKE_SKIP_DOTENV === "1") return;
  try {
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const { resolve } = require("node:path") as typeof import("node:path");
    const content = readFileSync(resolve(process.cwd(), ".env"), "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    /* optional */
  }
}

loadDotEnv();

async function main() {
  const householdId = process.env.MCP_HOUSEHOLD_ID?.trim();
  if (!householdId) {
    console.error("MCP_HOUSEHOLD_ID required");
    process.exit(1);
  }

  const prisma = createPrismaClient();
  try {
    const household = await prisma.household.findUnique({
      where: { id: householdId },
      select: { id: true },
    });
    if (!household) {
      console.error(`Household not found: ${householdId}`);
      process.exit(1);
    }

    await ensureNetworkCatalogues(householdId);

    const type = await prisma.networkDeviceType.findFirst({
      where: { householdId, slug: "pc" },
    });
    const location = await prisma.deviceLocation.findFirst({
      where: { householdId, slug: "unknown" },
    });
    if (!type || !location) {
      console.error("Missing pc type or unknown location after catalogue ensure");
      process.exit(1);
    }

    const stamp = Date.now().toString(16).slice(-6).padStart(6, "0");
    const macAllow = `02:00:00:${stamp.slice(0, 2)}:${stamp.slice(2, 4)}:${stamp.slice(4, 6)}`;
    const macNo = `02:11:00:${stamp.slice(0, 2)}:${stamp.slice(2, 4)}:${stamp.slice(4, 6)}`;
    const macRetired = `02:22:00:${stamp.slice(0, 2)}:${stamp.slice(2, 4)}:${stamp.slice(4, 6)}`;

    const allowlisted = await prisma.networkDevice.create({
      data: {
        householdId,
        name: `mcp-smoke wol allow ${stamp}`,
        typeId: type.id,
        locationId: location.id,
        macAddress: macAllow,
        wakeAllowed: true,
        notes: "mcp-smoke",
      },
    });
    const notAllowed = await prisma.networkDevice.create({
      data: {
        householdId,
        name: `mcp-smoke wol deny ${stamp}`,
        typeId: type.id,
        locationId: location.id,
        macAddress: macNo,
        wakeAllowed: false,
        notes: "mcp-smoke",
      },
    });
    const retired = await prisma.networkDevice.create({
      data: {
        householdId,
        name: `mcp-smoke wol retired ${stamp}`,
        typeId: type.id,
        locationId: location.id,
        macAddress: macRetired,
        wakeAllowed: true,
        retiredAt: new Date(),
        notes: "mcp-smoke",
      },
    });

    process.stdout.write(
      JSON.stringify({
        allowlisted_id: allowlisted.id,
        not_allowed_id: notAllowed.id,
        retired_id: retired.id,
      }) + "\n",
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
