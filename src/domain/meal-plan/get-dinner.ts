import { prisma } from "@/core/db";
import type { MealPlanDayDto } from "./types";
import { columnToDateKey, dateKeyToColumn, isDateKey } from "./week";

/**
 * The single planned dinner for one calendar day, or null when the slot is
 * empty. Narrower than `getMealPlan`, which also loads the whole recipe
 * library for the week picker — the dashboard needs only this one row.
 */
export async function getDinnerForDate(
  householdId: string,
  dateKey: string,
): Promise<MealPlanDayDto | null> {
  if (!isDateKey(dateKey)) return null;

  const entry = await prisma.mealPlanEntry.findFirst({
    where: { householdId, date: dateKeyToColumn(dateKey) },
    select: {
      date: true,
      recipe: { select: { id: true, title: true, thumbnailUrl: true } },
    },
  });

  if (!entry) return null;

  return {
    date: columnToDateKey(entry.date),
    recipeId: entry.recipe.id,
    title: entry.recipe.title,
    thumbnailUrl: entry.recipe.thumbnailUrl,
  };
}
