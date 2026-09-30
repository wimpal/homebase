/** DTOs shared by the meal-plan domain, server actions and client (T-118). */

export interface MealPlanDayDto {
  /** `YYYY-MM-DD` */
  date: string;
  recipeId?: string;
  title?: string;
  thumbnailUrl?: string | null;
}

export interface MealPlanRecipeOption {
  id: string;
  title: string;
}

export interface MealPlanDto {
  /** `YYYY-MM-DD` of the Monday this view starts at. */
  weekStart: string;
  /** `YYYY-MM-DD` of the Sunday this view ends at. */
  weekEnd: string;
  /** Exactly seven entries, Monday through Sunday. */
  days: MealPlanDayDto[];
  /** Household recipe library, alphabetical — picker options. */
  recipes: MealPlanRecipeOption[];
}

export interface RandomFillResult {
  filled: number;
  /** Empty slots counted before the fill. */
  requested: number;
  librarySize: number;
}

export interface AddWeekToShoppingResult {
  plannedDays: number;
  added: string[];
  /** Ingredient already on the need list — left untouched. */
  skipped: string[];
  errors: string[];
}
