/**
 * Pure Mon–Sun calendar-week helpers for the meal plan (T-118).
 * No database, no I/O — safe to unit test in scripts/meal-plan-selftest.ts.
 *
 * Storage convention: `MealPlanEntry.date` is a `@db.Date` column, which
 * round-trips through `toISOString().slice(0, 10)`. Every date key produced or
 * consumed here is `YYYY-MM-DD`, anchored at UTC midnight.
 */

const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True only for `YYYY-MM-DD` that maps to a real calendar date. */
export function isDateKey(value: string): boolean {
  const match = DATE_KEY_RE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const asUtc = new Date(Date.UTC(year, month - 1, day));
  return (
    asUtc.getUTCFullYear() === year &&
    asUtc.getUTCMonth() === month - 1 &&
    asUtc.getUTCDate() === day
  );
}

/** Today as `YYYY-MM-DD` in the given IANA timezone. */
export function todayKey(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const pick = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

/** `YYYY-MM-DD` → Date at UTC midnight (for `@db.Date` columns). */
export function dateKeyToColumn(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

/** Date from a `@db.Date` column → `YYYY-MM-DD`. */
export function columnToDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Monday of the week containing `dateKey` (UTC arithmetic, no local getters). */
export function weekStartKey(dateKey: string): string {
  const match = DATE_KEY_RE.exec(dateKey);
  if (!match) {
    throw new Error(`Invalid date key: ${dateKey}`);
  }
  const asUtc = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
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
