import { prisma } from "@/core/db";
import { DomainError } from "@/domain/error";
import { toRecipeDetail } from "./map";
import type { AddRecipeInput, RecipeDetail } from "./types";
import { normalizeRecipeInput } from "./validate";

export async function addRecipe(
  householdId: string,
  input: AddRecipeInput,
): Promise<RecipeDetail | DomainError> {
  const normalized = normalizeRecipeInput(input);
  if (normalized instanceof DomainError) return normalized;

  const existing = await prisma.recipe.findFirst({
    where: {
      householdId,
      title: { equals: normalized.title, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (existing) {
    return DomainError.conflict("Recipe title already exists", "title_conflict");
  }

  const instructions = normalized.steps.join("\n");

  const recipe = await prisma.recipe.create({
    data: {
      householdId,
      title: normalized.title,
      instructions,
      servings: normalized.servings,
      tags: normalized.tags,
      calories: normalized.calories,
      proteinG: normalized.proteinG,
      carbsG: normalized.carbsG,
      fatG: normalized.fatG,
      thumbnailUrl: normalized.thumbnailUrl,
      ingredients: {
        create: normalized.ingredients.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          group: item.group,
          optional: item.optional,
        })),
      },
      steps: {
        create: normalized.steps.map((text, index) => ({
          text,
          optional: normalized.stepOptional[index] ?? false,
          sortOrder: index,
        })),
      },
    },
    include: {
      ingredients: true,
      steps: { orderBy: { sortOrder: "asc" } },
    },
  });

  // source_url accepted by callers but not stored in v1
  void input.source_url;

  return toRecipeDetail(recipe);
}
