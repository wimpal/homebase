/**
 * Pure agenda formatting / range helpers for the household calendar read
 * (T-140). No database, no I/O - safe to unit test in
 * scripts/calendar-ics-selftest.ts.
 *
 * `schedule_lines` mirror Mimir's `brain/morning_brief.format_event_line`
 * (reference-only spoken fragments) and stay ASCII-safe: the literal
 * punctuation is plain ASCII and times render as `HH:MM`.
 */

import { addDaysKey } from "@/lib/dates";
import type { CalendarAgendaItem } from "./types";

/** Hard cap on an inclusive agenda range, to bound the payload. */
export const CALENDAR_AGENDA_MAX_DAYS = 92;

/** Calendar name + palette token used for household-native `CalendarEvent`. */
export const AGENDA_NATIVE_CALENDAR_NAME = "Homebase";
export const AGENDA_NATIVE_CALENDAR_COLOR = "emerald";

/** Date keys (`YYYY-MM-DD`) covering an inclusive range, capped. */
export function agendaDayKeys(startKey: string, endKey: string): string[] {
  const keys: string[] = [];
  for (
    let key = startKey;
    key <= endKey && keys.length < CALENDAR_AGENDA_MAX_DAYS;
    key = addDaysKey(key, 1)
  ) {
    keys.push(key);
  }
  return keys;
}

/** Household-local `HH:MM` (24h) for an ISO instant. */
export function agendaTimeLabel(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const pick = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${pick("hour")}:${pick("minute")}`;
}

/**
 * One reference-only schedule fragment, e.g.
 * `"Dentist, from 09:30 to 10:30 (Work)"` or `"Holiday, all day (Feeds)"`.
 */
export function formatAgendaScheduleLine(
  item: CalendarAgendaItem,
  timeZone: string,
): string {
  const title = item.title.trim() || "(no title)";
  const calendar = item.calendar_name.trim();

  let timePart: string;
  if (item.all_day) {
    timePart = "all day";
  } else {
    const start = agendaTimeLabel(item.start, timeZone);
    const end = item.end ? agendaTimeLabel(item.end, timeZone) : "";
    timePart = end && end !== start ? `from ${start} to ${end}` : `at ${start}`;
  }

  return calendar ? `${title}, ${timePart} (${calendar})` : `${title}, ${timePart}`;
}
