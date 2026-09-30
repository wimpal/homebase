import { prisma } from "@/core/db";
import { DomainError } from "@/domain/error";
import { dateKeyToColumn, isDateKey, weekDateKeys, weekStartKey } from "./week";

/**
 * Set (or replace) the dinner for one day. One row per household per day via
 * `householdId_date`, so re-assigning the same date overwrites the recipe.
 * Callers must have already checked recipe tenancy (assertRecipe).
 */
export async function assignDinner(
  householdId: string,
  dateKey: string,
  recipeId: string,
): Promise<void | DomainError> {
  if (!isDateKey(dateKey)) {
    return DomainError.invalidInput("Date must be YYYY-MM-DD.", "meal_plan_bad_date");
  }
  if (!recipeId) {
    return DomainError.invalidInput("Recipe is required.", "meal_plan_no_recipe");
  }

  await prisma.mealPlanEntry.upsert({
    where: { householdId_date: { householdId, date: dateKeyToColumn(dateKey) } },
    create: { householdId, date: dateKeyToColumn(dateKey), recipeId },
    update: { recipeId },
  });
}

/** Remove the dinner for one day. Missing rows are not an error. */
export async function clearDinner(
  householdId: string,
  dateKey: string,
): Promise<{ cleared: number } | DomainError> {
  if (!isDateKey(dateKey)) {
    return DomainError.invalidInput("Date must be YYYY-MM-DD.", "meal_plan_bad_date");
  }

  const result = await prisma.mealPlanEntry.deleteMany({
    where: { householdId, date: dateKeyToColumn(dateKey) },
  });

  return { cleared: result.count };
}

/** Remove every planned dinner in one Mon–Sun week. */
export async function clearWeekDinners(
  householdId: string,
  weekStart: string,
): Promise<{ cleared: number } | DomainError> {
  if (!isDateKey(weekStart)) {
    return DomainError.invalidInput(
      "Week start must be YYYY-MM-DD.",
      "meal_plan_bad_week",
    );
  }

  const dates = weekDateKeys(weekStartKey(weekStart));
  const result = await prisma.mealPlanEntry.deleteMany({
    where: {
      householdId,
      date: {
        gte: dateKeyToColumn(dates[0]),
        lte: dateKeyToColumn(dates[6]),
      },
    },
  });

  return { cleared: result.count };
}
