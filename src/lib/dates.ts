/**
 * Pure `YYYY-MM-DD` date-key helpers shared by meal-plan (T-118) and
 * calendar (T-139). No database, no I/O — safe to unit test in scripts.
 *
 * Storage convention: date keys are anchored at UTC midnight; zone-aware
 * helpers use Intl and never the host's local getters.
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

export function parseDateKey(dateKey: string): {
  year: number;
  month: number;
  day: number;
} {
  const match = DATE_KEY_RE.exec(dateKey);
  if (!match) {
    throw new Error(`Invalid date key: ${dateKey}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!isDateKey(dateKey)) {
    throw new Error(`Invalid date key: ${dateKey}`);
  }
  return { year, month, day };
}

/** `YYYY-MM-DD` → Date at UTC midnight. */
export function dateKeyToColumn(dateKey: string): Date {
  const { year, month, day } = parseDateKey(dateKey);
  return new Date(Date.UTC(year, month - 1, day));
}

/** Date anchored at UTC midnight → `YYYY-MM-DD`. */
export function columnToDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Shift a date key by whole days (UTC arithmetic, no local getters). */
export function addDaysKey(dateKey: string, days: number): string {
  const asUtc = dateKeyToColumn(dateKey);
  asUtc.setUTCDate(asUtc.getUTCDate() + days);
  return columnToDateKey(asUtc);
}

/** Calendar date of `instant` in the given IANA timezone as `YYYY-MM-DD`. */
export function dateKeyInTimeZone(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const pick = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

/** Today as `YYYY-MM-DD` in the given IANA timezone. */
export function todayKey(timeZone: string, now: Date = new Date()): string {
  return dateKeyInTimeZone(now, timeZone);
}
