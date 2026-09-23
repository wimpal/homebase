/** Print demo household id for MCP_HOUSEHOLD_ID setup. */
import { createPrismaClient } from "../src/core/db";

const prisma = createPrismaClient();

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
