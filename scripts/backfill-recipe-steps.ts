/**
 * Idempotent backfill: create RecipeStep rows from Recipe.instructions
 * when a recipe has zero steps. T-106.
 *
 * Usage: npx tsx scripts/backfill-recipe-steps.ts
 */
import { createPrismaClient } from "../src/core/db";

async function main() {
  const prisma = createPrismaClient();
  try {
    const recipes = await prisma.recipe.findMany({
      select: {
        id: true,
        instructions: true,
        _count: { select: { steps: true } },
      },
    });

    let updated = 0;
    for (const recipe of recipes) {
      if (recipe._count.steps > 0) continue;
      const steps = recipe.instructions
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      if (steps.length === 0) continue;

      await prisma.recipeStep.createMany({
        data: steps.map((text, index) => ({
          recipeId: recipe.id,
          text,
          optional: false,
          sortOrder: index,
        })),
      });
      updated += 1;
    }

    console.log(
      `backfill-recipe-steps: created steps for ${updated} recipe(s) (${recipes.length} scanned)`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
