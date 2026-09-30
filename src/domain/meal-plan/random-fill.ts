import { prisma } from "@/core/db";
import { DomainError } from "@/domain/error";
import type { RandomFillResult } from "./types";
import {
  columnToDateKey,
  dateKeyToColumn,
  isDateKey,
  planRandomFill,
  weekDateKeys,
  weekStartKey,
} from "./week";

/**
 * Fill the *empty* dinner slots of a Mon–Sun week with distinct random recipes
 * from the household library. Occupied days are never touched. When the library
 * is smaller than the number of empty days, only `librarySize` days are filled —
 * a recipe is never repeated to pad. Idempotent under a double click
 * (`skipDuplicates`).
 */
export async function randomFillDinners(
  householdId: string,
  weekStart: string,
): Promise<RandomFillResult | DomainError> {
  if (!isDateKey(weekStart)) {
    return DomainError.invalidInput(
      "Week start must be YYYY-MM-DD.",
      "meal_plan_bad_week",
    );
  }
  const start = weekStartKey(weekStart);

  const dates = weekDateKeys(start);
  const from = dateKeyToColumn(dates[0]);
  const to = dateKeyToColumn(dates[6]);

  const [entries, recipes] = await Promise.all([
    prisma.mealPlanEntry.findMany({
      where: { householdId, date: { gte: from, lte: to } },
      select: { date: true },
    }),
    prisma.recipe.findMany({
      where: { householdId },
      select: { id: true },
    }),
  ]);

  const taken = new Set(entries.map((e) => columnToDateKey(e.date)));
  const emptyDates = dates.filter((d) => !taken.has(d));
  const librarySize = recipes.length;

  if (emptyDates.length === 0 || librarySize === 0) {
    return { filled: 0, requested: emptyDates.length, librarySize };
  }

  const plan = planRandomFill(
    emptyDates,
    recipes.map((r) => r.id),
  );

  await prisma.mealPlanEntry.createMany({
    data: plan.map((slot) => ({
      householdId,
      date: dateKeyToColumn(slot.date),
      recipeId: slot.recipeId,
    })),
    skipDuplicates: true,
  });

  return { filled: plan.length, requested: emptyDates.length, librarySize };
}
