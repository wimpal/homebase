/** Intl formatting helpers for the calendar view (T-139). */

export function monthLabel(monthKey: string, bcp47: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat(bcp47, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

/** Monday-first short weekday labels. */
export function weekdayShortLabels(bcp47: string): string[] {
  return Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(bcp47, {
      weekday: "short",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(2024, 0, 1 + index))),
  );
}

/** Long date heading for the selected day (stable at 12:00 UTC). */
export function dayHeading(
  dateKey: string,
  bcp47: string,
  timeZone: string,
): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat(bcp47, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone,
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}
