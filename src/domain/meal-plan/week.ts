/**
 * Pure Mon–Sun calendar-week helpers for the meal plan (T-118).
 * No database, no I/O — safe to unit test in scripts/meal-plan-selftest.ts.
 *
 * Storage convention: `MealPlanEntry.date` is a `@db.Date` column, which
 * round-trips through `toISOString().slice(0, 10)`. Every date key produced or
 * consumed here is `YYYY-MM-DD`, anchored at UTC midnight.
 */

import {
  columnToDateKey,
  dateKeyToColumn,
  parseDateKey,
} from "@/lib/dates";

export {
  columnToDateKey,
  dateKeyToColumn,
  isDateKey,
  todayKey,
} from "@/lib/dates";

/** Monday of the week containing `dateKey` (UTC arithmetic, no local getters). */
export function weekStartKey(dateKey: string): string {
  const { year, month, day } = parseDateKey(dateKey);
  const asUtc = new Date(Date.UTC(year, month - 1, day));
  const mondayOffset = (asUtc.getUTCDay() + 6) % 7;
  asUtc.setUTCDate(asUtc.getUTCDate() - mondayOffset);
  return columnToDateKey(asUtc);
}

/** Seven consecutive keys, Monday through Sunday. */
export function weekDateKeys(weekStart: string): string[] {
  const start = dateKeyToColumn(weekStart);
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(start);
    day.setUTCDate(day.getUTCDate() + i);
    return columnToDateKey(day);
  });
}

export interface RandomFillSlot {
  date: string;
  recipeId: string;
}

/**
 * Pair the empty days of a week with a shuffled sample of distinct recipes.
 * Fisher–Yates over the recipe ids with an injectable `rng` for deterministic
 * tests. Stops when recipes run out — the caller gets fewer slots than empty
 * days when the library is smaller; a recipe is never repeated to pad.
 */
export function planRandomFill(
  emptyDates: string[],
  recipeIds: string[],
  rng: () => number = Math.random,
): RandomFillSlot[] {
  const pool = [...recipeIds];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return emptyDates
    .slice(0, pool.length)
    .map((date, index) => ({ date, recipeId: pool[index] }));
}
