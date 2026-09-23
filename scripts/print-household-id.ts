/** Print sole household id for MCP_HOUSEHOLD_ID setup (ADR-020). */
import { createPrismaClient } from "../src/core/db";

const prisma = createPrismaClient();

async function main() {
  const households = await prisma.household.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });

  if (households.length === 0) {
    console.error("No household found — run npm run db:seed on an empty DB, or Create household.");
    process.exit(1);
  }

  if (households.length > 1) {
    console.error(
      `Ambiguous: ${households.length} households (ADR-020 expects one). Use npm run household:list.`,
    );
    for (const h of households) {
      console.error(`  - ${h.name} ${h.id}`);
    }
    process.exit(1);
  }

  const household = households[0];
  console.log(`Household: ${household.name}`);
  console.log(`MCP_HOUSEHOLD_ID=${household.id}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
