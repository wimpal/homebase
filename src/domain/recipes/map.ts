import type { RecipeDetail, RecipeIngredientItem } from "./types";

export function parseSteps(instructions: string): string[] {
  return instructions
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function toRecipeDetail(recipe: {
  id: string;
  title: string;
  servings: number;
  instructions: string;
  ingredients: { name: string; quantity: string }[];
}): RecipeDetail {
  return {
    id: recipe.id,
    name: recipe.title,
    tags: [],
    ingredients: recipe.ingredients.map(
      (item): RecipeIngredientItem => ({
        name: item.name,
        quantity: item.quantity,
      }),
    ),
    servings: recipe.servings,
    steps: parseSteps(recipe.instructions),
    instructions: recipe.instructions,
  };
}
