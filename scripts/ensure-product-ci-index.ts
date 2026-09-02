/** Run after `prisma db push` — creates case-insensitive product name index. */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "Product_household_name_ci"
    ON "Product" ("householdId", LOWER("name"));
  `);
  console.log("Product name CI index ensured.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
