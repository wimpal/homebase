/**
 * Toggle Notes module for T-099 mcp-smoke (module-off / restore).
 *
 * Usage:
 *   MCP_HOUSEHOLD_ID=… npx tsx scripts/seed-notes-smoke-module.ts --status
 *   MCP_HOUSEHOLD_ID=… NOTES_RESTORE_ENABLED=true|false npx tsx scripts/seed-notes-smoke-module.ts --restore
 *   MCP_HOUSEHOLD_ID=… npx tsx scripts/seed-notes-smoke-module.ts --disable
 *     → prints { previous_enabled } after setting enabled=false
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
          moduleId: ModuleId.NOTES,
        },
      },
      select: { enabled: true },
    });
    // Registry defaultEnabled is true — treat missing row as enabled.
    console.log(JSON.stringify({ enabled: existing?.enabled ?? true }));
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
          moduleId: ModuleId.NOTES,
        },
      },
      create: {
        householdId,
        moduleId: ModuleId.NOTES,
        enabled,
      },
      update: { enabled },
    });
    console.log(JSON.stringify({ restored: true, enabled }));
  } finally {
    await prisma.$disconnect();
  }
}

async function disableModule(householdId: string) {
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
          moduleId: ModuleId.NOTES,
        },
      },
      select: { enabled: true },
    });
    const previous_enabled = existing?.enabled ?? true;

    await prisma.moduleSetting.upsert({
      where: {
        householdId_moduleId: {
          householdId,
          moduleId: ModuleId.NOTES,
        },
      },
      create: {
        householdId,
        moduleId: ModuleId.NOTES,
        enabled: false,
      },
      update: { enabled: false },
    });
    console.log(JSON.stringify({ previous_enabled }));
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const householdId = process.env.MCP_HOUSEHOLD_ID?.trim();
  if (!householdId) {
    console.error("MCP_HOUSEHOLD_ID is required");
    process.exit(1);
  }

  const args = process.argv.slice(2);
  if (args.includes("--status")) {
    await statusModule(householdId);
    return;
  }
  if (args.includes("--restore")) {
    const raw = process.env.NOTES_RESTORE_ENABLED?.trim().toLowerCase();
    const enabled = raw === "true" || raw === "1";
    await restoreModule(householdId, enabled);
    return;
  }
  if (args.includes("--disable")) {
    await disableModule(householdId);
    return;
  }

  console.error("Usage: --status | --disable | --restore (with NOTES_RESTORE_ENABLED)");
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
