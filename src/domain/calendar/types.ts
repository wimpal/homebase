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

export const CALENDAR_LAYERS = ["native", "feeds", "chores"] as const;

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
