/**
 * Delete leftover rows created by scripts/mcp-smoke.ts.
 *
 * Match rules (prefix only):
 *   ShoppingItem / Product — name starts with "mcp-smoke"
 *   Chore                  — title starts with "mcp-smoke"
 *   Recipe                 — title starts with "Smoke Add "
 *   Notification           — title or message contains "mcp-smoke" (e.g. "Chore due: mcp-smoke-…")
 *   McpChangeLog           — entityId in the deleted set
 *
 * Usage:
 *   npx tsx scripts/purge-smoke-data.ts          # dry-run (default)
 *   npx tsx scripts/purge-smoke-data.ts --apply  # delete
 *
 * NAS (Postgres not on LAN — run inside worker):
 *   docker compose exec worker npx tsx scripts/purge-smoke-data.ts
 *   docker compose exec worker npx tsx scripts/purge-smoke-data.ts --apply
 *
 * Optional: MCP_HOUSEHOLD_ID scopes to one household; otherwise all households.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import {
  applySmokePurge,
  collectSmokeMatches,
  formatPurgeCounts,
} from "./lib/purge-smoke";

function loadDotEnv() {
  try {
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
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env optional when DATABASE_URL is already set (worker container)
  }
}

loadDotEnv();

const APPLY = process.argv.includes("--apply");
const HOUSEHOLD_ID = process.env.MCP_HOUSEHOLD_ID?.trim() || undefined;
const SAMPLE_LIMIT = 15;

const prisma = new PrismaClient();

function printSection(
  title: string,
  rows: { id: string; label: string; householdId: string }[],
) {
  console.log(`\n${title}: ${rows.length}`);
  for (const row of rows.slice(0, SAMPLE_LIMIT)) {
    console.log(`  - ${row.label}  (${row.id}, household=${row.householdId})`);
  }
  if (rows.length > SAMPLE_LIMIT) {
    console.log(`  … and ${rows.length - SAMPLE_LIMIT} more`);
  }
}

async function main() {
  const matches = await collectSmokeMatches(prisma, {
    householdId: HOUSEHOLD_ID,
  });
  const allEntityIds = [
    ...matches.shoppingItems.map((r) => r.id),
    ...matches.products.map((r) => r.id),
    ...matches.chores.map((r) => r.id),
    ...matches.recipes.map((r) => r.id),
  ];

  const changeLogCount =
    allEntityIds.length === 0
      ? 0
      : await prisma.mcpChangeLog.count({
          where: {
            entityId: { in: allEntityIds },
            ...(HOUSEHOLD_ID ? { householdId: HOUSEHOLD_ID } : {}),
          },
        });

  console.log(
    APPLY
      ? "MODE: apply (will delete)"
      : "MODE: dry-run (pass --apply to delete)",
  );
  console.log(
    HOUSEHOLD_ID
      ? `SCOPE: household ${HOUSEHOLD_ID}`
      : "SCOPE: all households",
  );

  printSection("ShoppingItem (name starts with mcp-smoke)", matches.shoppingItems);
  printSection("Product (name starts with mcp-smoke)", matches.products);
  printSection("Chore (title starts with mcp-smoke)", matches.chores);
  printSection('Recipe (title starts with "Smoke Add ")', matches.recipes);
  printSection(
    "Notification (title or message contains mcp-smoke)",
    matches.notifications,
  );
  console.log(`\nMcpChangeLog (entityId in above): ${changeLogCount}`);

  const total =
    matches.shoppingItems.length +
    matches.products.length +
    matches.chores.length +
    matches.recipes.length +
    matches.notifications.length +
    changeLogCount;

  if (total === 0) {
    console.log("\nNothing to purge.");
    return;
  }

  if (!APPLY) {
    console.log(
      `\nDry-run only — ${total} row(s) would be affected. Re-run with --apply to delete.`,
    );
    return;
  }

  const counts = await applySmokePurge(prisma, { householdId: HOUSEHOLD_ID });
  console.log(`\nDeleted: ${formatPurgeCounts(counts)}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
