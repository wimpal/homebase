import { prisma } from "@/core/db";
import { DomainError } from "@/domain/error";
import type { RecipeDetail } from "./types";

function parseSteps(instructions: string): string[] {
  return instructions
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export async function getRecipe(
  householdId: string,
  id: string,
): Promise<RecipeDetail | DomainError> {
  const recipe = await prisma.recipe.findFirst({
    where: { id, householdId },
    include: { ingredients: true },
  });

  if (!recipe) {
    return DomainError.notFound("Recipe not found.");
  }

  return {
    id: recipe.id,
    name: recipe.title,
    tags: [],
    ingredients: recipe.ingredients.map((item) => ({
      name: item.name,
      quantity: item.quantity,
    })),
    servings: recipe.servings,
    steps: parseSteps(recipe.instructions),
    instructions: recipe.instructions,
  };
}
