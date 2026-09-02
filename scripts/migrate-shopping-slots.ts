/**
 * T-035 data migration — raw SQL only so it runs BEFORE `prisma db push`
 * on databases that still have the pre-T-035 schema (no autoAddWhenLowStock,
 * nullable productId, etc.).
 *
 *   npx tsx scripts/migrate-shopping-slots.ts
 *
 * Safe to re-run. Deploy order: this script → db push --accept-data-loss
 */
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function newProductId(): string {
  const time = Date.now().toString(36);
  const rand = randomBytes(8).toString("base64url").replace(/[^a-z0-9]/gi, "").toLowerCase();
  return `cm${time}${rand}`.slice(0, 25);
}

type ProductRow = {
  id: string;
  householdId: string;
  name: string;
  createdAt: Date;
};

type OrphanRow = {
  id: string;
  name: string;
  shoppingListId: string;
  householdId: string;
};

type SlotRow = {
  id: string;
  shoppingListId: string;
  productId: string | null;
  quantity: number;
  checked: boolean;
  createdAt: Date;
};

async function mergeDuplicateProducts() {
  const products = await prisma.$queryRaw<ProductRow[]>`
    SELECT id, "householdId", name, "createdAt"
    FROM "Product"
    ORDER BY "createdAt" ASC
  `;

  const groups = new Map<string, ProductRow[]>();
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
      await prisma.$executeRaw`UPDATE "StockItem" SET "productId" = ${survivor.id} WHERE "productId" = ${dupe.id}`;
      await prisma.$executeRaw`UPDATE "ShoppingItem" SET "productId" = ${survivor.id} WHERE "productId" = ${dupe.id}`;
      await prisma.$executeRaw`UPDATE "Barcode" SET "productId" = ${survivor.id} WHERE "productId" = ${dupe.id}`;
      await prisma.$executeRaw`UPDATE "RecipeIngredient" SET "productId" = ${survivor.id} WHERE "productId" = ${dupe.id}`;
      await prisma.$executeRaw`DELETE FROM "Product" WHERE id = ${dupe.id}`;
      console.log(`Merged product "${dupe.name}" -> ${survivor.id}`);
    }
  }
}

async function backfillShoppingProductIds() {
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
    const existing = await prisma.$queryRaw<ProductRow[]>`
      SELECT id, "householdId", name, "createdAt"
      FROM "Product"
      WHERE "householdId" = ${item.householdId}
    `;
    let product = existing.find(
      (p) => p.name.toLowerCase() === name.toLowerCase(),
    );

    if (!product) {
      const newId = newProductId();
      await prisma.$executeRaw`
        INSERT INTO "Product" (id, "householdId", name, "lowStockAt", "createdAt", "updatedAt")
        VALUES (${newId}, ${item.householdId}, ${name}, 1, NOW(), NOW())
      `;
      product = {
        id: newId,
        householdId: item.householdId,
        name,
        createdAt: new Date(),
      };
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
  const items = await prisma.$queryRaw<SlotRow[]>`
    SELECT id, "shoppingListId", "productId", quantity, checked, "createdAt"
    FROM "ShoppingItem"
    WHERE "productId" IS NOT NULL
    ORDER BY "createdAt" ASC
  `;

  const groups = new Map<string, SlotRow[]>();
  for (const item of items) {
    if (!item.productId) continue;
    const key = `${item.shoppingListId}::${item.productId}`;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }

  for (const [, group] of groups) {
    if (group.length <= 1) continue;

    const unchecked = group.filter((i) => !i.checked);
    const keeper =
      unchecked.sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      )[0] ??
      group.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

    const totalQty = group.reduce((sum, i) => sum + i.quantity, 0);
    await prisma.$executeRaw`
      UPDATE "ShoppingItem" SET quantity = ${totalQty} WHERE id = ${keeper.id}
    `;

    const toDelete = group.filter((i) => i.id !== keeper.id);
    for (const row of toDelete) {
      await prisma.$executeRaw`DELETE FROM "ShoppingItem" WHERE id = ${row.id}`;
    }
    console.log(`Deduped ${group.length} slots for product ${keeper.productId}`);
  }
}

async function main() {
  console.log("Merging duplicate products...");
  await mergeDuplicateProducts();
  console.log("Backfilling shopping item productIds...");
  await backfillShoppingProductIds();
  console.log("Deduping shopping slots...");
  await dedupeSlots();
  console.log("Done. Run: npx prisma db push --accept-data-loss");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
