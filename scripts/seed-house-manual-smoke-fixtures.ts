/**
 * Seed House manual docs + enable module for T-098 mcp-smoke.
 * Prints JSON: { searchable_id, private_id, previous_enabled }
 *
 * Usage:
 *   MCP_HOUSEHOLD_ID=… npx tsx scripts/seed-house-manual-smoke-fixtures.ts
 *   docker compose exec -e MCP_HOUSEHOLD_ID=… worker npx tsx scripts/seed-house-manual-smoke-fixtures.ts
 *
 * Restore module only (keeps docs for purge):
 *   MCP_HOUSEHOLD_ID=… HOUSE_MANUAL_RESTORE_ENABLED=true|false npx tsx scripts/seed-house-manual-smoke-fixtures.ts --restore
 *
 * Print current enabled flag:
 *   MCP_HOUSEHOLD_ID=… npx tsx scripts/seed-house-manual-smoke-fixtures.ts --status
 */
import { ModuleId } from "@prisma/client";
import { createPrismaClient } from "../src/core/db";

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

async function statusModule(householdId: string) {
  const prisma = createPrismaClient();
  try {
    const existing = await prisma.moduleSetting.findUnique({
      where: {
        householdId_moduleId: {
          householdId,
          moduleId: ModuleId.HOUSE_MANUAL,
        },
      },
      select: { enabled: true },
    });
    console.log(JSON.stringify({ enabled: existing?.enabled ?? false }));
  } finally {
    await prisma.$disconnect();
  }
}

async function restoreModule(householdId: string, enabled: boolean) {
  const prisma = createPrismaClient();
  try {
    await prisma.moduleSetting.upsert({
      where: {
        householdId_moduleId: {
          householdId,
          moduleId: ModuleId.HOUSE_MANUAL,
        },
      },
      create: {
        householdId,
        moduleId: ModuleId.HOUSE_MANUAL,
        enabled,
      },
      update: { enabled },
    });
    console.log(JSON.stringify({ restored: true, enabled }));
  } finally {
    await prisma.$disconnect();
  }
}

async function seed(householdId: string) {
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

    const existing = await prisma.moduleSetting.findUnique({
      where: {
        householdId_moduleId: {
          householdId,
          moduleId: ModuleId.HOUSE_MANUAL,
        },
      },
      select: { enabled: true },
    });
    const previous_enabled = existing?.enabled ?? false;

    await prisma.moduleSetting.upsert({
      where: {
        householdId_moduleId: {
          householdId,
          moduleId: ModuleId.HOUSE_MANUAL,
        },
      },
      create: {
        householdId,
        moduleId: ModuleId.HOUSE_MANUAL,
        enabled: true,
      },
      update: { enabled: true },
    });

    const stamp = Date.now().toString(16).slice(-6).padStart(6, "0");
    const body =
      "The fuse box (meterkast) is in the hallway cupboard next to the front door.";

    const searchable = await prisma.houseManualDocument.create({
      data: {
        householdId,
        title: `mcp-smoke house manual ${stamp}`,
        originalName: `mcp-smoke-fuse-${stamp}.txt`,
        mimeType: "text/plain",
        sizeBytes: Buffer.byteLength(body, "utf8"),
        url: `/api/uploads/${householdId}/house-manual/mcp-smoke-${stamp}.txt`,
        searchable: true,
        extractedText: body,
      },
    });

    const privateDoc = await prisma.houseManualDocument.create({
      data: {
        householdId,
        title: `mcp-smoke house manual private ${stamp}`,
        originalName: `mcp-smoke-private-${stamp}.txt`,
        mimeType: "text/plain",
        sizeBytes: 32,
        url: `/api/uploads/${householdId}/house-manual/mcp-smoke-private-${stamp}.txt`,
        searchable: false,
        extractedText: "Secret draft about fuse box — must not appear in search.",
      },
    });

    console.log(
      JSON.stringify({
        searchable_id: searchable.id,
        private_id: privateDoc.id,
        previous_enabled,
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const householdId = process.env.MCP_HOUSEHOLD_ID?.trim();
  if (!householdId) {
    console.error("MCP_HOUSEHOLD_ID required");
    process.exit(1);
  }

  if (process.argv.includes("--status")) {
    await statusModule(householdId);
    return;
  }

  if (process.argv.includes("--restore")) {
    const raw = process.env.HOUSE_MANUAL_RESTORE_ENABLED?.trim().toLowerCase();
    const enabled = raw === "true" || raw === "1";
    await restoreModule(householdId, enabled);
    return;
  }

  await seed(householdId);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
