/**
 * Pure month-grid / day-overlap helpers for the calendar view (T-139).
 * No database, no I/O — safe to unit test in scripts/calendar-ics-selftest.ts.
 */

import {
  addDaysKey,
  columnToDateKey,
  dateKeyInTimeZone,
  dateKeyToColumn,
  parseDateKey,
} from "@/lib/dates";

const MONTH_KEY_RE = /^(\d{4})-(\d{2})$/;

/** True only for `YYYY-MM`. */
export function isMonthKey(value: string): boolean {
  const match = MONTH_KEY_RE.exec(value);
  if (!match) return false;
  const month = Number(match[2]);
  return month >= 1 && month <= 12;
}

/** Month key (`YYYY-MM`) of a valid date key. */
export function monthKeyFromDateKey(dateKey: string): string {
  parseDateKey(dateKey);
  return dateKey.slice(0, 7);
}

/** Shift a month key by whole months (UTC arithmetic). */
export function addMonthsKey(monthKey: string, delta: number): string {
  if (!isMonthKey(monthKey)) {
    throw new Error(`Invalid month key: ${monthKey}`);
  }
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  const asUtc = new Date(Date.UTC(year, month - 1 + delta, 1));
  const y = asUtc.getUTCFullYear();
  const m = String(asUtc.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/**
 * Date keys of the full Monday-first weeks covering `monthKey`
 * (4–6 rows depending on the month).
 */
export function monthGridDateKeys(monthKey: string): string[] {
  if (!isMonthKey(monthKey)) {
    throw new Error(`Invalid month key: ${monthKey}`);
  }
  const firstKey = `${monthKey}-01`;
  const first = dateKeyToColumn(firstKey);
  const leading = (first.getUTCDay() + 6) % 7;
  const startKey = addDaysKey(firstKey, -leading);

  const lastDay = new Date(
    Date.UTC(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)), 0),
  );
  const lastKey = columnToDateKey(lastDay);
  const trailing = 6 - ((lastDay.getUTCDay() + 6) % 7);
  const endKey = addDaysKey(lastKey, trailing);

  const keys: string[] = [];
  let cursor = startKey;
  while (cursor <= endKey) {
    keys.push(cursor);
    cursor = addDaysKey(cursor, 1);
  }
  return keys;
}

/**
 * Instant range that safely covers every timezone day in the grid:
 * one day of padding on both sides. `endKey` is exclusive.
 */
export function paddedInstantRange(
  startKey: string,
  endKeyExclusive: string,
): { from: Date; to: Date } {
  const from = dateKeyToColumn(startKey);
  from.setUTCDate(from.getUTCDate() - 1);
  const to = dateKeyToColumn(endKeyExclusive);
  to.setUTCDate(to.getUTCDate() + 1);
  return { from, to };
}

/**
 * Date keys (household timezone) that an item overlaps.
 * All-day rows are anchored at UTC midnight and use exclusive `endAt`
 * (RFC 5545 DTEND semantics); timed rows use `endAt` minus a millisecond so
 * an end at local midnight does not bleed into the next day.
 */
export function overlappingDayKeys(
  startAt: Date,
  endAt: Date | null,
  allDay: boolean,
  timeZone: string,
): string[] {
  if (allDay) {
    const startKey = columnToDateKey(startAt);
    const endKeyExclusive = endAt ? columnToDateKey(endAt) : addDaysKey(startKey, 1);
    const keys: string[] = [];
    let cursor = startKey;
    while (cursor < endKeyExclusive && keys.length < 400) {
      keys.push(cursor);
      cursor = addDaysKey(cursor, 1);
    }
    return keys.length > 0 ? keys : [startKey];
  }

  const startKey = dateKeyInTimeZone(startAt, timeZone);
  const endAnchor = endAt ? new Date(endAt.getTime() - 1) : null;
  const endKey = endAnchor ? dateKeyInTimeZone(endAnchor, timeZone) : startKey;
  if (endKey <= startKey) return [startKey];

  const keys: string[] = [];
  let cursor = startKey;
  while (cursor <= endKey && keys.length < 400) {
    keys.push(cursor);
    cursor = addDaysKey(cursor, 1);
  }
  return keys;
}
