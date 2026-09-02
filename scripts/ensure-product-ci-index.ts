/** Run after `prisma db push` — creates case-insensitive product name index. */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

await prisma.$executeRawUnsafe(`
  CREATE UNIQUE INDEX IF NOT EXISTS "Product_household_name_ci"
  ON "Product" ("householdId", LOWER("name"));
`);

console.log("Product name CI index ensured.");
await prisma.$disconnect();
