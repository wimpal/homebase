import type {
  RecipeDetail,
  RecipeIngredientItem,
  RecipeSummary,
} from "./types";

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
  optional?: boolean | null;
}): RecipeIngredientItem {
  const mapped: RecipeIngredientItem = {
    name: item.name,
    quantity: item.quantity,
  };
  const group = item.group?.trim();
  if (group) {
    mapped.group = group;
  }
  if (item.optional) {
    mapped.optional = true;
  }
  return mapped;
}

type RecipeStepRow = {
  text: string;
  optional: boolean;
  sortOrder: number;
};

type RecipeForMap = {
  id: string;
  title: string;
  servings: number;
  instructions: string;
  tags?: string[] | null;
  calories?: number | null;
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
  thumbnailUrl?: string | null;
  ingredients: {
    name: string;
    quantity: string;
    group?: string | null;
    optional?: boolean | null;
  }[];
  steps?: RecipeStepRow[];
};

function resolveSteps(recipe: RecipeForMap): {
  steps: string[];
  stepOptional: boolean[];
  instructions: string;
} {
  if (recipe.steps && recipe.steps.length > 0) {
    const ordered = [...recipe.steps].sort((a, b) => a.sortOrder - b.sortOrder);
    const steps = ordered.map((s) => s.text);
    const stepOptional = ordered.map((s) => Boolean(s.optional));
    return {
      steps,
      stepOptional,
      instructions: steps.join("\n"),
    };
  }
  const steps = parseSteps(recipe.instructions);
  return {
    steps,
    stepOptional: steps.map(() => false),
    instructions: recipe.instructions,
  };
}

function omitNutrition(detail: RecipeDetail): RecipeDetail {
  return detail;
}

export function toRecipeDetail(recipe: RecipeForMap): RecipeDetail {
  const { steps, stepOptional, instructions } = resolveSteps(recipe);
  const detail: RecipeDetail = {
    id: recipe.id,
    name: recipe.title,
    tags: recipe.tags ?? [],
    ingredients: recipe.ingredients.map(toIngredientItem),
    servings: recipe.servings,
    steps,
    instructions,
  };

  if (stepOptional.some(Boolean)) {
    detail.step_optional = stepOptional;
  }
  if (recipe.thumbnailUrl) {
    detail.thumbnail_url = recipe.thumbnailUrl;
  }
  if (recipe.calories != null) {
    detail.calories = recipe.calories;
  }
  if (recipe.proteinG != null) {
    detail.protein_g = recipe.proteinG;
  }
  if (recipe.carbsG != null) {
    detail.carbs_g = recipe.carbsG;
  }
  if (recipe.fatG != null) {
    detail.fat_g = recipe.fatG;
  }

  return omitNutrition(detail);
}

export function toRecipeSummary(recipe: RecipeForMap): RecipeSummary {
  const detail = toRecipeDetail(recipe);
  const summary: RecipeSummary = {
    id: detail.id,
    name: detail.name,
    tags: detail.tags,
    ingredients: detail.ingredients,
    servings: detail.servings,
  };
  if (detail.thumbnail_url) {
    summary.thumbnail_url = detail.thumbnail_url;
  }
  if (detail.calories != null) {
    summary.calories = detail.calories;
  }
  return summary;
}
