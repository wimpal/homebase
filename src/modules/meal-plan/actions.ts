"use server";

import { requireHousehold, requireMutationAccess } from "@/core/auth/session";
import { assertRecipe } from "@/core/tenancy/assertHouseholdResource";
import { isDomainError } from "@/domain/error";
import {
  assignDinner,
  clearDinner,
  getMealPlan as getMealPlanWeekData,
  isDateKey,
  randomFillDinners,
  addWeekIngredientsToShopping,
  type AddWeekToShoppingResult,
  type MealPlanDto,
  type RandomFillResult,
} from "@/domain/meal-plan";
import {
  type ActionResult,
  failResult,
  fromDomainError,
  okResult,
} from "@/lib/action-result";
import { ModuleId } from "@prisma/client";
import { revalidatePath } from "next/cache";

export async function getMealPlanWeek(
  weekStart?: string,
): Promise<MealPlanDto> {
  const { householdId } = await requireHousehold();
  return getMealPlanWeekData(householdId, weekStart);
}

export async function assignDinnerAction(
  formData: FormData,
): Promise<ActionResult> {
  const { householdId } = await requireMutationAccess(ModuleId.MEAL_PLAN);
  const date = String(formData.get("date") ?? "");
  const recipeId = String(formData.get("recipeId") ?? "");

  if (!isDateKey(date)) {
    return failResult("Date must be YYYY-MM-DD.", "meal_plan_bad_date");
  }
  if (!recipeId) {
    return failResult("Choose a recipe first.", "meal_plan_no_recipe");
  }

  try {
    await assertRecipe(householdId, recipeId);
  } catch {
    return failResult("Recipe not found.", "not_found");
  }

  const result = await assignDinner(householdId, date, recipeId);
  if (isDomainError(result)) return fromDomainError(result);

  revalidatePath("/meal-plan");
  return okResult();
}

export async function clearDinnerAction(
  formData: FormData,
): Promise<ActionResult> {
  const { householdId } = await requireMutationAccess(ModuleId.MEAL_PLAN);
  const date = String(formData.get("date") ?? "");

  if (!isDateKey(date)) {
    return failResult("Date must be YYYY-MM-DD.", "meal_plan_bad_date");
  }

  const result = await clearDinner(householdId, date);
  if (isDomainError(result)) return fromDomainError(result);

  revalidatePath("/meal-plan");
  return okResult();
}

export async function randomFillAction(
  formData: FormData,
): Promise<ActionResult<RandomFillResult>> {
  const { householdId } = await requireMutationAccess(ModuleId.MEAL_PLAN);
  const weekStart = String(formData.get("weekStart") ?? "");

  if (!isDateKey(weekStart)) {
    return failResult("Week start must be YYYY-MM-DD.", "meal_plan_bad_week");
  }

  const result = await randomFillDinners(householdId, weekStart);
  if (isDomainError(result)) return fromDomainError(result);

  revalidatePath("/meal-plan");
  return okResult(result);
}

export async function addWeekToShoppingAction(
  formData: FormData,
): Promise<ActionResult<AddWeekToShoppingResult>> {
  const { householdId } = await requireMutationAccess(ModuleId.MEAL_PLAN);
  const weekStart = String(formData.get("weekStart") ?? "");

  if (!isDateKey(weekStart)) {
    return failResult("Week start must be YYYY-MM-DD.", "meal_plan_bad_week");
  }

  const result = await addWeekIngredientsToShopping(householdId, weekStart);
  if (isDomainError(result)) return fromDomainError(result);

  revalidatePath("/meal-plan");
  revalidatePath("/shopping");
  return okResult(result);
}
