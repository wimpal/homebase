/**
 * Delete leftover rows created by scripts/mcp-smoke.ts.
 *
 * Match rules (prefix only):
 *   ShoppingItem / Product — name starts with "mcp-smoke"
 *   Chore                  — title starts with "mcp-smoke"
 *   Recipe                 — title starts with "Smoke Add "
 *   Notification           — title contains "mcp-smoke" (e.g. "Chore due: mcp-smoke-…")
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
import { PrismaClient, type Prisma } from "@prisma/client";

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

type NamedRow = { id: string; label: string; householdId: string };

function notificationWhere(): Prisma.NotificationWhereInput {
  return {
    title: { contains: "mcp-smoke" },
    ...(HOUSEHOLD_ID ? { householdId: HOUSEHOLD_ID } : {}),
  };
}

async function collectMatches(): Promise<{
  shoppingItems: NamedRow[];
  products: NamedRow[];
  chores: NamedRow[];
  recipes: NamedRow[];
  notifications: NamedRow[];
}> {
  const shoppingWhere: Prisma.ShoppingItemWhereInput = {
    name: { startsWith: "mcp-smoke" },
    ...(HOUSEHOLD_ID
      ? { shoppingList: { householdId: HOUSEHOLD_ID } }
      : {}),
  };
  const productWhere: Prisma.ProductWhereInput = {
    name: { startsWith: "mcp-smoke" },
    ...(HOUSEHOLD_ID ? { householdId: HOUSEHOLD_ID } : {}),
  };
  const choreWhere: Prisma.ChoreWhereInput = {
    title: { startsWith: "mcp-smoke" },
    ...(HOUSEHOLD_ID ? { householdId: HOUSEHOLD_ID } : {}),
  };
  const recipeWhere: Prisma.RecipeWhereInput = {
    title: { startsWith: "Smoke Add " },
    ...(HOUSEHOLD_ID ? { householdId: HOUSEHOLD_ID } : {}),
  };

  const [shoppingItems, products, chores, recipes, notifications] =
    await Promise.all([
      prisma.shoppingItem.findMany({
        where: shoppingWhere,
        select: {
          id: true,
          name: true,
          shoppingList: { select: { householdId: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.product.findMany({
        where: productWhere,
        select: { id: true, name: true, householdId: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.chore.findMany({
        where: choreWhere,
        select: { id: true, title: true, householdId: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.recipe.findMany({
        where: recipeWhere,
        select: { id: true, title: true, householdId: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.notification.findMany({
        where: notificationWhere(),
        select: { id: true, title: true, householdId: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);

  return {
    shoppingItems: shoppingItems.map((r) => ({
      id: r.id,
      label: r.name,
      householdId: r.shoppingList.householdId,
    })),
    products: products.map((r) => ({
      id: r.id,
      label: r.name,
      householdId: r.householdId,
    })),
    chores: chores.map((r) => ({
      id: r.id,
      label: r.title,
      householdId: r.householdId,
    })),
    recipes: recipes.map((r) => ({
      id: r.id,
      label: r.title,
      householdId: r.householdId,
    })),
    notifications: notifications.map((r) => ({
      id: r.id,
      label: r.title,
      householdId: r.householdId,
    })),
  };
}

function printSection(title: string, rows: NamedRow[]) {
  console.log(`\n${title}: ${rows.length}`);
  for (const row of rows.slice(0, SAMPLE_LIMIT)) {
    console.log(`  - ${row.label}  (${row.id}, household=${row.householdId})`);
  }
  if (rows.length > SAMPLE_LIMIT) {
    console.log(`  … and ${rows.length - SAMPLE_LIMIT} more`);
  }
}

async function main() {
  const matches = await collectMatches();
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
  printSection("Recipe (title starts with \"Smoke Add \")", matches.recipes);
  printSection(
    "Notification (title contains mcp-smoke)",
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

  const result = await prisma.$transaction(async (tx) => {
    const changeLog =
      allEntityIds.length === 0
        ? { count: 0 }
        : await tx.mcpChangeLog.deleteMany({
            where: {
              entityId: { in: allEntityIds },
              ...(HOUSEHOLD_ID ? { householdId: HOUSEHOLD_ID } : {}),
            },
          });

    const notification = await tx.notification.deleteMany({
      where: notificationWhere(),
    });

    const shoppingItem = await tx.shoppingItem.deleteMany({
      where: {
        name: { startsWith: "mcp-smoke" },
        ...(HOUSEHOLD_ID
          ? { shoppingList: { householdId: HOUSEHOLD_ID } }
          : {}),
      },
    });

    const product = await tx.product.deleteMany({
      where: {
        name: { startsWith: "mcp-smoke" },
        ...(HOUSEHOLD_ID ? { householdId: HOUSEHOLD_ID } : {}),
      },
    });

    const chore = await tx.chore.deleteMany({
      where: {
        title: { startsWith: "mcp-smoke" },
        ...(HOUSEHOLD_ID ? { householdId: HOUSEHOLD_ID } : {}),
      },
    });

    const recipe = await tx.recipe.deleteMany({
      where: {
        title: { startsWith: "Smoke Add " },
        ...(HOUSEHOLD_ID ? { householdId: HOUSEHOLD_ID } : {}),
      },
    });

    return { changeLog, notification, shoppingItem, product, chore, recipe };
  });

  console.log("\nDeleted:");
  console.log(`  McpChangeLog:  ${result.changeLog.count}`);
  console.log(`  Notification:  ${result.notification.count}`);
  console.log(`  ShoppingItem:  ${result.shoppingItem.count}`);
  console.log(`  Product:       ${result.product.count}`);
  console.log(`  Chore:         ${result.chore.count}`);
  console.log(`  Recipe:        ${result.recipe.count}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
