import { prisma } from "@/core/db";
import { DomainError } from "@/domain/error";
import { toRecipeDetail } from "./map";
import type { RecipeDetail } from "./types";

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

  return toRecipeDetail(recipe);
}
