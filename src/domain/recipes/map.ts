import type { RecipeDetail, RecipeIngredientItem } from "./types";

export function parseSteps(instructions: string): string[] {
  return instructions
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function toIngredientItem(item: {
  name: string;
  quantity: string;
  group?: string | null;
}): RecipeIngredientItem {
  const mapped: RecipeIngredientItem = {
    name: item.name,
    quantity: item.quantity,
  };
  const group = item.group?.trim();
  if (group) {
    mapped.group = group;
  }
  return mapped;
}

export function toRecipeDetail(recipe: {
  id: string;
  title: string;
  servings: number;
  instructions: string;
  ingredients: { name: string; quantity: string; group?: string | null }[];
}): RecipeDetail {
  return {
    id: recipe.id,
    name: recipe.title,
    tags: [],
    ingredients: recipe.ingredients.map(toIngredientItem),
    servings: recipe.servings,
    steps: parseSteps(recipe.instructions),
    instructions: recipe.instructions,
  };
}
