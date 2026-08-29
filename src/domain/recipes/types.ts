export interface RecipeIngredientItem {
  name: string;
  quantity: string;
}

export interface RecipeSummary {
  id: string;
  name: string;
  tags: string[];
  ingredients: RecipeIngredientItem[];
  servings: number;
}

export interface RecipeDetail extends RecipeSummary {
  steps: string[];
  instructions: string;
}

export interface SearchRecipesInput {
  query?: string;
  ingredients?: string[];
}
