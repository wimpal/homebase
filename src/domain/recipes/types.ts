export interface RecipeIngredientItem {
  name: string;
  quantity: string;
  /** Subsection key (dressing, marinade, …); omit when main/ungrouped. */
  group?: string;
  /** When true, ingredient is optional; omit when false. */
  optional?: boolean;
}

export interface RecipeTimerItem {
  label: string;
  minutes: number;
}

export interface RecipeNutrition {
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
}

export interface RecipeSummary {
  id: string;
  name: string;
  tags: string[];
  ingredients: RecipeIngredientItem[];
  servings: number;
  thumbnail_url?: string;
  calories?: number;
}

export interface RecipeDetail extends RecipeSummary {
  steps: string[];
  /** Parallel to steps[]; omitted when all false. */
  step_optional?: boolean[];
  instructions: string;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
}

export interface SearchRecipesInput {
  query?: string;
  ingredients?: string[];
  /** Exact normalized tags; recipe must include all (AND). */
  tags?: string[];
}

export interface AddRecipeInput {
  title: string;
  servings?: number;
  ingredients: RecipeIngredientItem[];
  steps: string[];
  step_optional?: boolean[];
  tags?: string[];
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  thumbnail_url?: string | null;
  source_url?: string;
}

export interface UpdateRecipeInput {
  id: string;
  title: string;
  servings?: number;
  ingredients: RecipeIngredientItem[];
  steps: string[];
  step_optional?: boolean[];
  tags?: string[];
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  /** Full-replace: omit or null clears. */
  thumbnail_url?: string | null;
  source_url?: string;
  /** Full replace of RecipeTimer rows; empty array clears. Omit to leave timers unchanged. */
  timers?: RecipeTimerItem[];
}
