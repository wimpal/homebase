import { prisma } from "@/core/db";
import type { Prisma } from "@prisma/client";
import { toRecipeSummary } from "./map";
import { normalizeTags } from "./validate";
import type { RecipeSummary, SearchRecipesInput } from "./types";
import { DomainError } from "@/domain/error";

const MAX_RESULTS = 25;

function buildIngredientFilters(
  ingredients: string[],
): Prisma.RecipeWhereInput[] {
  return ingredients
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => ({
      ingredients: {
        some: {
          name: { contains: name, mode: "insensitive" as const },
        },
      },
    }));
}

export async function searchRecipes(
  householdId: string,
  input: SearchRecipesInput = {},
): Promise<RecipeSummary[]> {
  const andFilters: Prisma.RecipeWhereInput[] = [];

  const query = input.query?.trim();
  if (query) {
    const normalizedQuery = query.toLowerCase();
    andFilters.push({
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { tags: { has: normalizedQuery } },
      ],
    });
  }

  if (input.ingredients?.length) {
    andFilters.push(...buildIngredientFilters(input.ingredients));
  }

  if (input.tags?.length) {
    const tags = normalizeTags(input.tags);
    if (tags instanceof DomainError) {
      return [];
    }
    if (tags.length > 0) {
      andFilters.push({ tags: { hasEvery: tags } });
    }
  }

  const where: Prisma.RecipeWhereInput = {
    householdId,
    ...(andFilters.length > 0 ? { AND: andFilters } : {}),
  };

  const recipes = await prisma.recipe.findMany({
    where,
    include: {
      ingredients: true,
      steps: { orderBy: { sortOrder: "asc" } },
    },
    orderBy: { title: "asc" },
    take: MAX_RESULTS,
  });

  return recipes.map(toRecipeSummary);
}
