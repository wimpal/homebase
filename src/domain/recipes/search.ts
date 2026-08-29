import { prisma } from "@/core/db";
import type { Prisma } from "@prisma/client";
import type { RecipeIngredientItem, RecipeSummary, SearchRecipesInput } from "./types";

const MAX_RESULTS = 25;

type RecipeWithIngredients = Prisma.RecipeGetPayload<{
  include: { ingredients: true };
}>;

function toIngredientItems(
  ingredients: RecipeWithIngredients["ingredients"],
): RecipeIngredientItem[] {
  return ingredients.map((item) => ({
    name: item.name,
    quantity: item.quantity,
  }));
}

function toRecipeSummary(recipe: RecipeWithIngredients): RecipeSummary {
  return {
    id: recipe.id,
    name: recipe.title,
    tags: [],
    ingredients: toIngredientItems(recipe.ingredients),
    servings: recipe.servings,
  };
}

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
  const where: Prisma.RecipeWhereInput = { householdId };

  if (input.query?.trim()) {
    where.title = { contains: input.query.trim(), mode: "insensitive" };
  }

  const ingredientFilters = input.ingredients
    ? buildIngredientFilters(input.ingredients)
    : [];
  if (ingredientFilters.length > 0) {
    where.AND = ingredientFilters;
  }

  const recipes = await prisma.recipe.findMany({
    where,
    include: { ingredients: true },
    orderBy: { title: "asc" },
    take: MAX_RESULTS,
  });

  return recipes.map(toRecipeSummary);
}
