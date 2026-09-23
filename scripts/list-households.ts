/** List all households with members + basic counts (ADR-020 diagnostics). */
import { createPrismaClient } from "../src/core/db";

const prisma = createPrismaClient();

async function main() {
  const households = await prisma.household.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      createdAt: true,
      memberships: {
        select: {
          role: true,
          user: { select: { email: true, name: true } },
        },
      },
      _count: {
        select: {
          products: true,
          shoppingLists: true,
          recipes: true,
          lightAutomations: true,
        },
      },
    },
  });

  const count = households.length;
  const mode = count === 0 ? "zero" : count === 1 ? "one" : "many";
  console.log(`households: ${count} (mode=${mode})`);
  console.log(`MCP_HOUSEHOLD_ID=${process.env.MCP_HOUSEHOLD_ID ?? "(unset)"}`);

  for (const h of households) {
    const members = h.memberships
      .map((m) => `${m.user.email} (${m.role})`)
      .join(", ");
    console.log(
      [
        `- ${h.name}`,
        `  id=${h.id}`,
        `  created=${h.createdAt.toISOString()}`,
        `  members: ${members || "(none)"}`,
        `  products=${h._count.products} lists=${h._count.shoppingLists} recipes=${h._count.recipes} automations=${h._count.lightAutomations}`,
      ].join("\n"),
    );
  }

  if (count !== 1) {
    console.error(
      count === 0
        ? "Expected one household (ADR-020). Create household via UI or seed an empty DB."
        : "Expected one household (ADR-020). Create/Join are disabled until extras are removed.",
    );
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
