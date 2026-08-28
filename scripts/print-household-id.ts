/** Print demo household id for MCP_HOUSEHOLD_ID setup. */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const household = await prisma.household.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  if (!household) {
    console.error("No household found — run npm run db:seed first.");
    process.exit(1);
  }
  console.log(`Household: ${household.name}`);
  console.log(`MCP_HOUSEHOLD_ID=${household.id}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
