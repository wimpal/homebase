/**
 * Calendar domain types (T-139 / ADR-029).
 *
 * Subscriptions are household-owned read-only ICS links. Their occurrences
 * live in `CalendarFeedOccurrence` and are replaced per sync — native
 * `CalendarEvent` rows are never touched by the sync.
 */

export const CALENDAR_FEED_COLORS = [
  "emerald",
  "sky",
  "violet",
  "amber",
  "rose",
  "teal",
] as const;

export type CalendarFeedColor = (typeof CALENDAR_FEED_COLORS)[number];

export function isCalendarFeedColor(value: unknown): value is CalendarFeedColor {
  return (
    typeof value === "string" &&
    (CALENDAR_FEED_COLORS as readonly string[]).includes(value)
  );
}

export const CALENDAR_LAYERS = [
  "native",
  "feeds",
  "chores",
  "birthdays",
] as const;

export type CalendarLayer = (typeof CALENDAR_LAYERS)[number];

export function isCalendarLayer(value: unknown): value is CalendarLayer {
  return (
    typeof value === "string" &&
    (CALENDAR_LAYERS as readonly string[]).includes(value)
  );
}

export type CalendarLayerPrefs = Record<CalendarLayer, boolean>;

export const DEFAULT_CALENDAR_LAYER_PREFS: CalendarLayerPrefs = {
  native: true,
  feeds: true,
  chores: true,
  birthdays: true,
};

export const CALENDAR_FEED_NAME_MAX = 80;
export const CALENDAR_FEED_URL_MAX = 1000;

export type CalendarSubscriptionRow = {
  id: string;
  householdId: string;
  name: string;
  url: string;
  color: string;
  enabled: boolean;
  lastSyncedAt: Date | null;
  lastSyncError: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CalendarOccurrenceDTO = {
  id: string;
  subscriptionId: string;
  feedName: string;
  feedColor: string;
  title: string;
  description: string | null;
  location: string | null;
  startAt: Date;
  endAt: Date | null;
  allDay: boolean;
};

export type ParsedFeedOccurrence = {
  externalKey: string;
  title: string;
  description: string | null;
  location: string | null;
  startAt: Date;
  endAt: Date | null;
  allDay: boolean;
};

export type SyncFeedResult =
  | { ok: true; count: number }
  | { ok: false; error: string };

/** Requested agenda layers over MCP (T-140); item-level `source` is singular. */
export const CALENDAR_AGENDA_SOURCES = ["events", "feeds"] as const;

export type CalendarAgendaSourceFilter = (typeof CALENDAR_AGENDA_SOURCES)[number];

export function isCalendarAgendaSourceFilter(
  value: unknown,
): value is CalendarAgendaSourceFilter {
  return (
    typeof value === "string" &&
    (CALENDAR_AGENDA_SOURCES as readonly string[]).includes(value)
  );
}

/** One Mimir-groundable agenda row (native event or feed occurrence). */
export interface CalendarAgendaItem {
  source: "event" | "feed";
  id: string;
  title: string;
  /** ISO instant. */
  start: string;
  /** ISO instant; omitted for open-ended rows. */
  end?: string;
  all_day: boolean;
  /** "Homebase" for native events; the subscription name for feeds. */
  calendar_name: string;
  /** Palette token: "emerald" for native events; a feed colour token. */
  calendar_color: string;
}

/** Stable read payload for `homebase.calendar.agenda`. */
export interface CalendarAgenda {
  /** Inclusive household-local date keys (`YYYY-MM-DD`). */
  range: { start: string; end: string };
  event_count: number;
  events: CalendarAgendaItem[];
  /** Reference-only spoken fragments (T-028); never paste as JSON escapes. */
  schedule_lines: string[];
  /** True when a requested feed is showing a sync error. */
  stale?: boolean;
  /** Per-feed sync problems; `source` is the feed name, never the URL. */
  errors?: Array<{ source: string; message: string }>;
}
