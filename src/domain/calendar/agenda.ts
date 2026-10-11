/**
 * Household calendar agenda read (T-140): native `CalendarEvent` rows plus
 * synced read-only ICS feed occurrences, for one day or an inclusive range.
 *
 * Read-only. Chores are deliberately NOT included - deadline Chores stay on
 * `homebase.tasks.list`. Never returns a subscription URL or credential.
 * Household-local day boundaries from `Household.timezone`.
 */

import { ModuleId } from "@prisma/client";
import { prisma } from "@/core/db";
import { isModuleEnabled } from "@/core/modules/settings";
import { DomainError } from "@/domain/error";
import { addDaysKey, dateKeyToColumn, isDateKey } from "@/lib/dates";
import {
  AGENDA_NATIVE_CALENDAR_COLOR,
  AGENDA_NATIVE_CALENDAR_NAME,
  CALENDAR_AGENDA_MAX_DAYS,
  agendaDayKeys,
  formatAgendaScheduleLine,
} from "./agenda-format";
import { overlappingDayKeys, paddedInstantRange } from "./dates";
import { listCalendarOccurrences } from "./occurrences";
import {
  type CalendarAgenda,
  type CalendarAgendaItem,
  isCalendarAgendaSourceFilter,
} from "./types";

export type CalendarAgendaInput = {
  /** Single day, `YYYY-MM-DD`. Mutually exclusive with start/end. */
  date?: string;
  /** Inclusive range start, `YYYY-MM-DD`. Requires `end`. */
  start?: string;
  /** Inclusive range end, `YYYY-MM-DD`. Requires `start`. */
  end?: string;
  /** Requested layers; default both. */
  sources?: readonly string[];
};

const MS_PER_DAY = 86_400_000;

function resolveRange(
  input: CalendarAgendaInput,
): { start: string; end: string } | DomainError {
  const usingDate = typeof input.date === "string" && input.date.length > 0;
  const usingRange =
    (typeof input.start === "string" && input.start.length > 0) ||
    (typeof input.end === "string" && input.end.length > 0);

  if (usingDate && usingRange) {
    return DomainError.invalidInput(
      "Provide either date or start/end, not both.",
      "agenda_range_conflict",
    );
  }
  if (usingDate) {
    if (!isDateKey(input.date as string)) {
      return DomainError.invalidInput(
        "date must be YYYY-MM-DD.",
        "agenda_date_invalid",
      );
    }
    return { start: input.date as string, end: input.date as string };
  }
  if (
    typeof input.start !== "string" ||
    typeof input.end !== "string" ||
    input.start.length === 0 ||
    input.end.length === 0
  ) {
    return DomainError.invalidInput(
      "Provide date, or both start and end.",
      "agenda_range_missing",
    );
  }
  if (!isDateKey(input.start) || !isDateKey(input.end)) {
    return DomainError.invalidInput(
      "start and end must be YYYY-MM-DD.",
      "agenda_range_invalid",
    );
  }
  if (input.start > input.end) {
    return DomainError.invalidInput(
      "start must not be after end.",
      "agenda_range_reversed",
    );
  }

  const spanDays =
    Math.round(
      (dateKeyToColumn(input.end).getTime() -
        dateKeyToColumn(input.start).getTime()) /
        MS_PER_DAY,
    ) + 1;
  if (spanDays > CALENDAR_AGENDA_MAX_DAYS) {
    return DomainError.invalidInput(
      `Range must be at most ${CALENDAR_AGENDA_MAX_DAYS} days.`,
      "agenda_range_too_long",
    );
  }

  return { start: input.start, end: input.end };
}

function resolveSources(
  raw: readonly string[] | undefined,
): { events: boolean; feeds: boolean } | DomainError {
  if (raw === undefined) {
    return { events: true, feeds: true };
  }
  if (!Array.isArray(raw) || raw.length === 0) {
    return DomainError.invalidInput(
      "sources must contain events, feeds, or both.",
      "agenda_sources_invalid",
    );
  }
  for (const source of raw) {
    if (!isCalendarAgendaSourceFilter(source)) {
      return DomainError.invalidInput(
        'sources may only contain "events" or "feeds".',
        "agenda_sources_invalid",
      );
    }
  }
  return {
    events: raw.includes("events"),
    feeds: raw.includes("feeds"),
  };
}

export async function getCalendarAgenda(
  householdId: string,
  input: CalendarAgendaInput,
): Promise<CalendarAgenda | DomainError> {
  if (!(await isModuleEnabled(householdId, ModuleId.CALENDAR))) {
    return DomainError.unavailable(
      "Calendar is disabled for this household.",
      "calendar_module_disabled",
    );
  }

  const range = resolveRange(input);
  if (range instanceof DomainError) return range;

  const sources = resolveSources(input.sources);
  if (sources instanceof DomainError) return sources;

  const household = await prisma.household.findUnique({
    where: { id: householdId },
    select: { timezone: true },
  });
  if (!household) {
    return DomainError.notFound("Household not found.", "household_not_found");
  }
  const timeZone = household.timezone || "Europe/Amsterdam";

  const requestedKeys = agendaDayKeys(range.start, range.end);
  const requested = new Set(requestedKeys);
  const padded = paddedInstantRange(range.start, addDaysKey(range.end, 1));

  const items: CalendarAgendaItem[] = [];

  if (sources.events) {
    const events = await prisma.calendarEvent.findMany({
      where: {
        householdId,
        startAt: { lt: padded.to },
        OR: [
          { endAt: { gte: padded.from } },
          { endAt: null, startAt: { gte: padded.from } },
        ],
      },
      orderBy: { startAt: "asc" },
    });

    for (const event of events) {
      const days = overlappingDayKeys(
        event.startAt,
        event.endAt,
        false,
        timeZone,
      );
      if (!days.some((day) => requested.has(day))) continue;
      items.push({
        source: "event",
        id: event.id,
        title: event.title,
        start: event.startAt.toISOString(),
        ...(event.endAt ? { end: event.endAt.toISOString() } : {}),
        all_day: false,
        calendar_name: AGENDA_NATIVE_CALENDAR_NAME,
        calendar_color: AGENDA_NATIVE_CALENDAR_COLOR,
      });
    }
  }

  if (sources.feeds) {
    const occurrences = await listCalendarOccurrences(
      householdId,
      padded.from,
      padded.to,
    );

    for (const occurrence of occurrences) {
      const days = overlappingDayKeys(
        occurrence.startAt,
        occurrence.endAt,
        occurrence.allDay,
        timeZone,
      );
      if (!days.some((day) => requested.has(day))) continue;
      items.push({
        source: "feed",
        id: occurrence.id,
        title: occurrence.title,
        start: occurrence.startAt.toISOString(),
        ...(occurrence.endAt ? { end: occurrence.endAt.toISOString() } : {}),
        all_day: occurrence.allDay,
        calendar_name: occurrence.feedName,
        calendar_color: occurrence.feedColor,
      });
    }
  }

  items.sort((a, b) => {
    if (a.all_day !== b.all_day) return a.all_day ? -1 : 1;
    const byStart = Date.parse(a.start) - Date.parse(b.start);
    if (byStart !== 0) return byStart;
    return a.title.localeCompare(b.title);
  });

  let stale: boolean | undefined;
  let errors: Array<{ source: string; message: string }> | undefined;
  if (sources.feeds) {
    const subscriptions = await prisma.calendarSubscription.findMany({
      where: { householdId, enabled: true },
      select: { name: true, lastSyncError: true },
    });
    const failed = subscriptions.filter((row) => row.lastSyncError);
    stale = failed.length > 0;
    if (failed.length > 0) {
      errors = failed.map((row) => ({
        source: row.name,
        message: row.lastSyncError as string,
      }));
    }
  }

  return {
    range,
    event_count: items.length,
    events: items,
    schedule_lines: items.map((item) => formatAgendaScheduleLine(item, timeZone)),
    ...(stale !== undefined ? { stale } : {}),
    ...(errors ? { errors } : {}),
  };
}
