import { prisma } from "@/core/db";
import type { MealPlanDayDto, MealPlanDto } from "./types";
import {
  columnToDateKey,
  dateKeyToColumn,
  isDateKey,
  todayKey,
  weekDateKeys,
  weekStartKey,
} from "./week";

/**
 * Current Mon–Sun week for a household: seven day rows (recipe id / title /
 * thumbnail) plus the recipe library for the picker. An unknown `weekStartParam`
 * falls back to the household's current week.
 */
export async function getMealPlan(
  householdId: string,
  weekStartParam?: string,
): Promise<MealPlanDto> {
  const household = await prisma.household.findUnique({
    where: { id: householdId },
    select: { timezone: true },
  });
  const weekStart = weekStartKey(
    weekStartParam && isDateKey(weekStartParam)
      ? weekStartParam
      : todayKey(household?.timezone ?? "Europe/Amsterdam"),
  );

  const dates = weekDateKeys(weekStart);
  const from = dateKeyToColumn(dates[0]);
  const to = dateKeyToColumn(dates[6]);

  const [entries, recipes] = await Promise.all([
    prisma.mealPlanEntry.findMany({
      where: { householdId, date: { gte: from, lte: to } },
      include: { recipe: { select: { id: true, title: true, thumbnailUrl: true } } },
    }),
    prisma.recipe.findMany({
      where: { householdId },
      select: { id: true, title: true },
      orderBy: { title: "asc" },
    }),
  ]);

  const byDate = new Map<string, MealPlanDayDto>();
  for (const entry of entries) {
    byDate.set(columnToDateKey(entry.date), {
      date: columnToDateKey(entry.date),
      recipeId: entry.recipe.id,
      title: entry.recipe.title,
      thumbnailUrl: entry.recipe.thumbnailUrl,
    });
  }

  return {
    weekStart,
    weekEnd: dates[6],
    days: dates.map((date) => byDate.get(date) ?? { date }),
    recipes,
  };
}
