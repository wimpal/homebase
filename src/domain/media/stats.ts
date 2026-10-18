import { prisma } from "@/core/db";
import { DomainError, isDomainError } from "@/domain/error";
import { addDaysKey, dateKeyInTimeZone, isDateKey, todayKey, zonedDateTimeToInstant } from "@/lib/dates";
import { fetchPagedItems, MEDIA_LOOKUP_FIELDS } from "./find";
import { assertMediaReady } from "./gate";
import type { JellyfinItem } from "./types";
import { isRecord, normalizeJellyfinDate, toInt } from "./util";

export const STATS_PERIODS = [
  "this_year", "last_year", "last_month", "last_7_days", "last_30_days", "custom",
] as const;
export type StatsPeriod = (typeof STATS_PERIODS)[number];

const PERIOD_LABELS: Record<StatsPeriod, string> = {
  this_year: "this calendar year",
  last_year: "last calendar year",
  last_month: "last calendar month",
  last_7_days: "last 7 days",
  last_30_days: "last 30 days",
  custom: "custom window",
};
const RECENT_TITLES = 5;
const STATS_MAX_PAGES = 20;
const DAY_MS = 86_400_000;
const NOTE_REWATCH = "Jellyfin keeps only the last play per film; a rewatched film counts once";
const NOTE_SERIES = "series and episodes are not counted — that is a different number";
const NOTE_NOT_SUPPORTED = "times watched and hours watched are not available from Jellyfin";
const NOTE_TRUNCATED =
  "results may be truncated at the per-source page cap; the count may be a floor";
const NOTE_EMPTY = "no films had their last play in this window";

export interface StatsWindow {
  start: Date;
  end: Date;
  period: StatsPeriod;
  label: string;
  timeZone: string;
}

export interface StatsFilmRow {
  id: string;
  title: string;
  year: number | null;
  last_played_at: string | null;
}

export interface MediaStatsPayload {
  window: { period: StatsPeriod; since: string; until: string; timezone: string; label: string };
  counts: { films_last_played_in_window: number; meaning: string };
  watch_history: false;
  watch_counts_supported: false;
  hours_watched_supported: false;
  series_counted: false;
  not_supported: string[];
  recent_titles: StatsFilmRow[];
  truncated: boolean;
  empty: boolean;
  notes: string[];
}

function safeTimeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return "UTC";
  }
}

function localMidnight(dateKey: string, timeZone: string): Date {
  const instant = zonedDateTimeToInstant(`${dateKey}T00:00`, timeZone);
  if (!instant) throw new Error(`invalid date key ${dateKey}`);
  return instant;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Port of Mimir media_watch_stats._resolve_window. */
export function resolveStatsWindow(
  input: { period?: string; since?: string; until?: string },
  timeZone: string,
  now: Date = new Date(),
): StatsWindow | DomainError {
  const raw = input.period ?? "this_year";
  if (!(STATS_PERIODS as readonly string[]).includes(raw)) {
    return DomainError.invalidInput(
      `period must be one of ${STATS_PERIODS.join(", ")}`,
      "invalid_period",
    );
  }
  const period = raw as StatsPeriod;
  const tz = safeTimeZone(timeZone);
  const today = todayKey(tz, now);
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  let start: Date;
  let end: Date;
  if (period === "this_year") {
    start = localMidnight(`${year}-01-01`, tz);
    end = localMidnight(`${year + 1}-01-01`, tz);
  } else if (period === "last_year") {
    start = localMidnight(`${year - 1}-01-01`, tz);
    end = localMidnight(`${year}-01-01`, tz);
  } else if (period === "last_month") {
    const prevYear = month === 1 ? year - 1 : year;
    const prevMonth = month === 1 ? 12 : month - 1;
    start = localMidnight(`${prevYear}-${pad2(prevMonth)}-01`, tz);
    end = localMidnight(`${year}-${pad2(month)}-01`, tz);
  } else if (period === "last_7_days") {
    start = new Date(now.getTime() - 7 * DAY_MS);
    end = now;
  } else if (period === "last_30_days") {
    start = new Date(now.getTime() - 30 * DAY_MS);
    end = now;
  } else {
    const since = (input.since ?? "").trim();
    const until = (input.until ?? "").trim();
    if (!since || !until) {
      return DomainError.invalidInput(
        "period=custom requires both since and until (YYYY-MM-DD)",
        "invalid_dates",
      );
    }
    if (!isDateKey(since) || !isDateKey(until)) {
      return DomainError.invalidInput("since and until must be YYYY-MM-DD dates", "invalid_dates");
    }
    if (since > until) {
      return DomainError.invalidInput("since must not be after until", "invalid_dates");
    }
    start = localMidnight(since, tz);
    end = localMidnight(addDaysKey(until, 1), tz);
  }
  return { start, end, period, label: PERIOD_LABELS[period], timeZone: tz };
}

export function filmRow(raw: JellyfinItem): StatsFilmRow | null {
  if (String(raw.Type ?? "") !== "Movie") return null;
  if (!raw.Id || !raw.Name) return null;
  return {
    id: String(raw.Id),
    title: String(raw.Name),
    year: toInt(raw.ProductionYear),
    last_played_at: normalizeJellyfinDate(isRecord(raw.UserData) ? raw.UserData.LastPlayedDate : null),
  };
}

/** Port of the shaping half of Mimir media_watch_stats. */
export function shapeStats(
  raws: JellyfinItem[],
  truncated: boolean,
  window: StatsWindow,
): MediaStatsPayload {
  const seen = new Set<string>();
  const matched: StatsFilmRow[] = [];
  for (const raw of raws) {
    const row = filmRow(raw);
    if (!row || seen.has(row.id)) continue;
    seen.add(row.id);
    if (!row.last_played_at) continue;
    const played = new Date(row.last_played_at);
    if (Number.isNaN(played.getTime())) continue;
    if (played >= window.start && played < window.end) matched.push(row);
  }
  matched.sort((a, b) => {
    const x = a.last_played_at ?? "";
    const y = b.last_played_at ?? "";
    return x < y ? 1 : x > y ? -1 : 0;
  });
  const empty = matched.length === 0;
  const notes = [NOTE_REWATCH, NOTE_SERIES, NOTE_NOT_SUPPORTED];
  if (empty) notes.push(NOTE_EMPTY);
  if (truncated) notes.push(NOTE_TRUNCATED);
  return {
    window: {
      period: window.period,
      since: dateKeyInTimeZone(window.start, window.timeZone),
      until: dateKeyInTimeZone(window.end, window.timeZone),
      timezone: window.timeZone,
      label: window.label,
    },
    counts: {
      films_last_played_in_window: matched.length,
      meaning: "films whose last play fell in the window",
    },
    watch_history: false,
    watch_counts_supported: false,
    hours_watched_supported: false,
    series_counted: false,
    not_supported: ["times watched", "hours watched", "series/episode counts"],
    recent_titles: matched.slice(0, RECENT_TITLES),
    truncated,
    empty,
    notes,
  };
}

export async function getMediaStats(
  householdId: string,
  input: { period?: string; since?: string; until?: string },
): Promise<MediaStatsPayload | DomainError> {
  const household = await prisma.household.findUnique({
    where: { id: householdId },
    select: { timezone: true },
  });
  if (!household) return DomainError.notFound("Household not found.", "household_not_found");
  const window = resolveStatsWindow(input, household.timezone || "Europe/Amsterdam");
  if (isDomainError(window)) return window;
  const config = await assertMediaReady(householdId);
  if (isDomainError(config)) return config;
  const fetched = await fetchPagedItems(
    config,
    {
      IncludeItemTypes: "Movie",
      Recursive: "true",
      Filters: "IsPlayed",
      EnableUserData: "true",
      Fields: MEDIA_LOOKUP_FIELDS,
      SortBy: "DatePlayed",
      SortOrder: "Descending",
    },
    STATS_MAX_PAGES,
  );
  if (isDomainError(fetched)) return fetched;
  return shapeStats(fetched.items, fetched.truncated, window);
}
