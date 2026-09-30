import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, locale = "en-US") {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

export function formatDateTime(
  date: Date | string | number,
  locale = "en-US",
  options?: Intl.DateTimeFormatOptions,
) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleString(locale, options);
}

export function formatDate(
  date: Date | string | number,
  locale = "en-US",
  options?: Intl.DateTimeFormatOptions,
) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString(locale, options);
}

/**
 * Calendar-day facts for the "Today" tile.
 *
 * Pass `timezone` (IANA) whenever this runs on the server: the local
 * `getFullYear()`/`getMonth()` getters would otherwise read the *server's*
 * zone, which is usually UTC and drifts a day either side of midnight.
 * The arithmetic is done in UTC on the resolved calendar date, so it is
 * immune to DST — `new Date(y, 0, 0)` plus a day-count is not.
 */
export function getTodayInfo(date = new Date(), timezone?: string) {
  const { year, month, day } = resolveCalendarDate(date, timezone);
  const dayOfYear =
    Math.round(
      (Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / 86400000,
    ) + 1;
  const weekOfYear = Math.ceil(dayOfYear / 7);
  const isLeap =
    (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInYear = isLeap ? 366 : 365;
  const daysLeft = daysInYear - dayOfYear;
  const percentOfYear = Math.round((dayOfYear / daysInYear) * 100);

  return { dayOfYear, weekOfYear, daysLeft, percentOfYear, daysInYear };
}

/** Y-M-D of `date` in `timezone`, or the host's local date when omitted. */
function resolveCalendarDate(date: Date, timezone?: string) {
  if (!timezone) {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
    };
  }
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const pick = (type: string) =>
      parts.find((p) => p.type === type)?.value ?? "";
    const year = Number(pick("year"));
    const month = Number(pick("month"));
    const day = Number(pick("day"));
    if ([year, month, day].every((n) => Number.isFinite(n) && n > 0)) {
      return { year, month, day };
    }
  } catch {
    // Invalid IANA zone — fall through to the host's local date.
  }
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  };
}
