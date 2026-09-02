/**
 * One-off data migration for T-035: merge duplicate products, backfill productId
 * on shopping items, dedupe slots.
 *
 * Safe to re-run (idempotent-ish). Works with post-T-035 Prisma schema (required
 * productId) by using raw SQL for orphan rows.
 *
 * Run once per database when upgrading from pre-T-035:
 *   npx tsx scripts/migrate-shopping-slots.ts
 *
 * If productId is already NOT NULL and backfilled, orphan step is a no-op.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type OrphanRow = {
  id: string;
  name: string;
  shoppingListId: string;
  householdId: string;
};

async function mergeDuplicateProducts() {
  const products = await prisma.product.findMany({
    orderBy: { createdAt: "asc" },
  });

  const groups = new Map<string, typeof products>();
  for (const p of products) {
    const key = `${p.householdId}::${p.name.toLowerCase()}`;
    const list = groups.get(key) ?? [];
    list.push(p);
    groups.set(key, list);
  }

  for (const [, group] of groups) {
    if (group.length <= 1) continue;
    const [survivor, ...dupes] = group;
    for (const dupe of dupes) {
      await prisma.stockItem.updateMany({
        where: { productId: dupe.id },
        data: { productId: survivor.id },
      });
      await prisma.shoppingItem.updateMany({
        where: { productId: dupe.id },
        data: { productId: survivor.id },
      });
      await prisma.barcode.updateMany({
        where: { productId: dupe.id },
        data: { productId: survivor.id },
      });
      await prisma.recipeIngredient.updateMany({
        where: { productId: dupe.id },
        data: { productId: survivor.id },
      });
      await prisma.product.delete({ where: { id: dupe.id } });
      console.log(`Merged product "${dupe.name}" -> ${survivor.id}`);
    }
  }
}

async function backfillShoppingProductIds() {
  // Raw SQL: Prisma client rejects productId: null once schema marks it required.
  const orphans = await prisma.$queryRaw<OrphanRow[]>`
    SELECT si.id, si.name, si."shoppingListId", sl."householdId"
    FROM "ShoppingItem" si
    INNER JOIN "ShoppingList" sl ON sl.id = si."shoppingListId"
    WHERE si."productId" IS NULL
  `;

  if (orphans.length === 0) {
    console.log("No orphan shopping items (productId already set).");
    return;
  }

  for (const item of orphans) {
    const name = item.name.trim();
    const existing = await prisma.product.findMany({
      where: { householdId: item.householdId },
    });
    let product = existing.find(
      (p) => p.name.toLowerCase() === name.toLowerCase(),
    );

    if (!product) {
      product = await prisma.product.create({
        data: { householdId: item.householdId, name },
      });
      console.log(`Created product "${name}" for orphan shopping item`);
    }

    await prisma.$executeRaw`
      UPDATE "ShoppingItem"
      SET "productId" = ${product.id}, name = ${product.name}
      WHERE id = ${item.id}
    `;
  }
}

async function dedupeSlots() {
  const items = await prisma.shoppingItem.findMany({
    orderBy: { createdAt: "asc" },
  });

  const groups = new Map<string, typeof items>();
  for (const item of items) {
    const key = `${item.shoppingListId}::${item.productId}`;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }

  for (const [, group] of groups) {
    if (group.length <= 1) continue;

    const unchecked = group.filter((i) => !i.checked);
    const keeper =
      unchecked.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ??
      group.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

    const totalQty = group.reduce((sum, i) => sum + i.quantity, 0);
    await prisma.shoppingItem.update({
      where: { id: keeper.id },
      data: { quantity: totalQty },
    });

    const toDelete = group.filter((i) => i.id !== keeper.id);
    await prisma.shoppingItem.deleteMany({
      where: { id: { in: toDelete.map((i) => i.id) } },
    });
    console.log(`Deduped ${group.length} slots for product ${keeper.productId}`);
  }
}

async function ensureCiIndex() {
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "Product_household_name_ci"
    ON "Product" ("householdId", LOWER("name"));
  `);
}

async function main() {
  console.log("Merging duplicate products...");
  await mergeDuplicateProducts();
  console.log("Backfilling shopping item productIds...");
  await backfillShoppingProductIds();
  console.log("Deduping shopping slots...");
  await dedupeSlots();
  console.log("Ensuring case-insensitive product name index...");
  try {
    await ensureCiIndex();
  } catch (e) {
    console.warn("CI index (may already exist):", e);
  }
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
