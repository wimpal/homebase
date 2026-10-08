/**
 * ICS parse / RRULE expansion for calendar subscriptions (T-139).
 *
 * Parse behaviour takes inspiration from Mimir's `brain/tools/calendar.py`
 * (window expansion, all-day handling, per-feed errors) — but Homebase never
 * calls Mimir at runtime (ADR-029).
 */

import ical from "node-ical";
import type { CalendarResponse, EventInstance, VEvent } from "node-ical";
import {
  addDaysKey,
  dateKeyInTimeZone,
  dateKeyToColumn,
} from "@/lib/dates";
import type { ParsedFeedOccurrence } from "./types";

export const FEED_FETCH_TIMEOUT_MS = 15_000;
export const MAX_OCCURRENCES_PER_FEED = 3000;

/**
 * Calendar date of a date-only (all-day) value. node-ical materialises
 * floating date-only values at host-local midnight (and attaches `tz` when
 * the source carried one), so local getters recover the source date.
 */
function allDayDateKey(date: Date & { tz?: string }): string {
  if (date.tz) {
    return dateKeyInTimeZone(date, date.tz);
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** `webcal://` → `https://`; only http(s) survives. Null = unusable URL. */
export function normalizeFeedUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^webcal:\/\//i.test(trimmed)) {
    return `https://${trimmed.slice("webcal://".length)}`;
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.toString();
    }
    return null;
  } catch {
    return null;
  }
}

function text(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (value && typeof value === "object" && "val" in value) {
    return text((value as { val: unknown }).val);
  }
  return null;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "unknown error";
}

/**
 * Parse an ICS body and expand every VEVENT (incl. RRULE / EXDATE /
 * RECURRENCE-ID) into occurrences overlapping `[from, to]`.
 * Throws `Error` with a calm message on parse/expand failure or feed cap.
 */
export function parseFeedOccurrences(
  icsText: string,
  window: { from: Date; to: Date },
): ParsedFeedOccurrence[] {
  let data: CalendarResponse;
  try {
    data = ical.sync.parseICS(icsText);
  } catch (err) {
    throw new Error(`invalid ICS: ${errorMessage(err)}`);
  }

  const out: ParsedFeedOccurrence[] = [];
  const seen = new Set<string>();

  for (const component of Object.values(data)) {
    if (!component || component.type !== "VEVENT") continue;
    const event = component as VEvent;
    // RECURRENCE-ID rows are folded into their master by node-ical.
    if (event.recurrenceid) continue;
    if (!(event.start instanceof Date)) continue;

    let instances: EventInstance[];
    try {
      instances = ical.expandRecurringEvent(event, {
        from: window.from,
        to: window.to,
        includeOverrides: true,
        excludeExdates: true,
        expandOngoing: false,
      });
    } catch (err) {
      throw new Error(`ICS expand failed: ${errorMessage(err)}`);
    }
    if (instances.length > MAX_OCCURRENCES_PER_FEED) {
      throw new Error(
        `feed expands to more than ${MAX_OCCURRENCES_PER_FEED} events in this window`,
      );
    }

    for (const instance of instances) {
      const start = instance.start;
      if (!(start instanceof Date)) continue;

      const source = instance.event;
      const title =
        text(instance.summary) ?? text(source.summary) ?? "(no title)";
      const description = text(source.description) ?? text(event.description);
      const location = text(source.location) ?? text(event.location);
      const uid = text(source.uid) ?? text(event.uid) ?? "";

      let startAt = start;
      let endAt = instance.end instanceof Date ? instance.end : null;
      if (instance.isFullDay) {
        const key = allDayDateKey(start);
        startAt = dateKeyToColumn(key);
        const endKey = endAt ? allDayDateKey(endAt) : null;
        endAt = dateKeyToColumn(
          endKey && endKey > key ? endKey : addDaysKey(key, 1),
        );
      }

      const recurrenceAnchor =
        instance.isOverride && source.recurrenceid instanceof Date
          ? source.recurrenceid.toISOString()
          : startAt.toISOString();
      const externalKey = uid
        ? `${uid}:${recurrenceAnchor}`
        : `${recurrenceAnchor}:${title.slice(0, 40)}`;
      if (seen.has(externalKey)) continue;
      seen.add(externalKey);

      out.push({
        externalKey,
        title,
        description,
        location,
        startAt,
        endAt: endAt && endAt.getTime() > startAt.getTime() ? endAt : null,
        allDay: Boolean(instance.isFullDay),
      });
    }
  }

  out.sort(
    (a, b) =>
      a.startAt.getTime() - b.startAt.getTime() ||
      a.title.localeCompare(b.title),
  );
  return out;
}
