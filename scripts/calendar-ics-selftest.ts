/**
 * T-139 self-test: ICS parse/RRULE expansion, all-day handling, day overlap
 * math, month-grid math and URL normalisation. No database access —
 * run with `npm run calendar:selftest`.
 */
import {
  addMonthsKey,
  isMonthKey,
  monthGridDateKeys,
  overlappingDayKeys,
} from "../src/domain/calendar/dates";
import {
  normalizeFeedUrl,
  parseFeedOccurrences,
} from "../src/domain/calendar/ics";
import {
  AGENDA_NATIVE_CALENDAR_COLOR,
  AGENDA_NATIVE_CALENDAR_NAME,
  CALENDAR_AGENDA_MAX_DAYS,
  agendaDayKeys,
  agendaTimeLabel,
  formatAgendaScheduleLine,
} from "../src/domain/calendar/agenda-format";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const WINDOW = {
  from: new Date("2026-09-01T00:00:00.000Z"),
  to: new Date("2026-12-31T23:59:59.000Z"),
};

function ics(...vevents: string[]): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Homebase//calendar-selftest//EN",
    ...vevents,
    "END:VCALENDAR",
  ].join("\r\n");
}

// --- RRULE weekly expansion inside the window -------------------------------
{
  const rows = parseFeedOccurrences(
    ics(
      [
        "BEGIN:VEVENT",
        "UID:weekly-1",
        "DTSTAMP:20260901T000000Z",
        "DTSTART:20261005T090000Z",
        "DTEND:20261005T100000Z",
        "RRULE:FREQ=WEEKLY;COUNT=3",
        "SUMMARY:Weekly call",
        "END:VEVENT",
      ].join("\r\n"),
    ),
    WINDOW,
  );
  assert(rows.length === 3, `weekly: expected 3 got ${rows.length}`);
  assert(
    rows.map((r) => r.startAt.toISOString()).join(",") ===
      "2026-10-05T09:00:00.000Z,2026-10-12T09:00:00.000Z,2026-10-19T09:00:00.000Z",
    "weekly: wrong occurrence dates",
  );
  assert(rows[0].title === "Weekly call", "weekly: title");
}

// --- EXDATE excludes one instance -------------------------------------------
{
  const rows = parseFeedOccurrences(
    ics(
      [
        "BEGIN:VEVENT",
        "UID:exdate-1",
        "DTSTAMP:20260901T000000Z",
        "DTSTART:20261005T090000Z",
        "DTEND:20261005T100000Z",
        "RRULE:FREQ=DAILY;COUNT=3",
        "EXDATE:20261006T090000Z",
        "SUMMARY:Exdate test",
        "END:VEVENT",
      ].join("\r\n"),
    ),
    WINDOW,
  );
  assert(rows.length === 2, `exdate: expected 2 got ${rows.length}`);
  assert(
    rows[1].startAt.toISOString() === "2026-10-07T09:00:00.000Z",
    "exdate: excluded date still present",
  );
}

// --- RECURRENCE-ID override moves one instance ------------------------------
{
  const rows = parseFeedOccurrences(
    ics(
      [
        "BEGIN:VEVENT",
        "UID:override-1",
        "DTSTAMP:20260901T000000Z",
        "DTSTART:20261005T090000Z",
        "DTEND:20261005T100000Z",
        "RRULE:FREQ=WEEKLY;COUNT=3",
        "SUMMARY:Base",
        "END:VEVENT",
      ].join("\r\n"),
      [
        "BEGIN:VEVENT",
        "UID:override-1",
        "RECURRENCE-ID:20261012T090000Z",
        "DTSTAMP:20260901T000000Z",
        "DTSTART:20261012T150000Z",
        "DTEND:20261012T160000Z",
        "SUMMARY:Moved",
        "END:VEVENT",
      ].join("\r\n"),
    ),
    WINDOW,
  );
  const moved = rows.find((r) => r.title === "Moved");
  assert(moved, "override: moved instance missing");
  assert(
    moved.startAt.toISOString() === "2026-10-12T15:00:00.000Z",
    "override: start not applied",
  );
  assert(
    !rows.some((r) => r.title === "Base" && r.startAt.toISOString() === "2026-10-12T09:00:00.000Z"),
    "override: base instance not replaced",
  );
}

// --- All-day event stays on its UTC-anchored date ---------------------------
{
  const rows = parseFeedOccurrences(
    ics(
      [
        "BEGIN:VEVENT",
        "UID:allday-1",
        "DTSTAMP:20260901T000000Z",
        "DTSTART;VALUE=DATE:20261010",
        "DTEND;VALUE=DATE:20261011",
        "SUMMARY:All day thing",
        "END:VEVENT",
      ].join("\r\n"),
    ),
    WINDOW,
  );
  assert(rows.length === 1, `all-day: expected 1 got ${rows.length}`);
  assert(rows[0].allDay, "all-day: flag missing");
  assert(
    rows[0].startAt.toISOString() === "2026-10-10T00:00:00.000Z",
    "all-day: start not UTC midnight",
  );
  assert(
    rows[0].endAt?.toISOString() === "2026-10-11T00:00:00.000Z",
    "all-day: end not exclusive next midnight",
  );
}

// --- Multi-day timed overlap keys (household timezone) ----------------------
{
  const keys = overlappingDayKeys(
    new Date("2026-10-09T22:00:00.000Z"),
    new Date("2026-10-11T02:00:00.000Z"),
    false,
    "Europe/Amsterdam",
  );
  assert(
    keys.join(",") === "2026-10-10,2026-10-11",
    `overlap: got ${keys.join(",")}`,
  );

  const allDayKeys = overlappingDayKeys(
    new Date("2026-10-10T00:00:00.000Z"),
    new Date("2026-10-12T00:00:00.000Z"),
    true,
    "Europe/Amsterdam",
  );
  assert(
    allDayKeys.join(",") === "2026-10-10,2026-10-11",
    `overlap all-day: got ${allDayKeys.join(",")}`,
  );
}

// --- URL normalisation -------------------------------------------------------
assert(
  normalizeFeedUrl("webcal://example.com/family.ics") ===
    "https://example.com/family.ics",
  "webcal URL not normalised",
);
assert(
  normalizeFeedUrl("https://example.com/family.ics") ===
    "https://example.com/family.ics",
  "https URL should pass through",
);
assert(normalizeFeedUrl("ftp://example.com/family.ics") === null, "ftp rejected");
assert(normalizeFeedUrl("nonsense") === null, "garbage rejected");

// --- Month-grid math ---------------------------------------------------------
assert(isMonthKey("2026-10"), "month key valid");
assert(!isMonthKey("2026-13"), "month 13 rejected");
assert(addMonthsKey("2026-12", 1) === "2027-01", "year rollover");
assert(addMonthsKey("2026-01", -1) === "2025-12", "year back-roll");
{
  const keys = monthGridDateKeys("2026-10");
  assert(keys[0] === "2026-09-28", `grid starts Monday, got ${keys[0]}`);
  assert(keys[keys.length - 1] === "2026-11-01", `grid ends Sunday, got ${keys[keys.length - 1]}`);
  assert(keys.length === 35, `grid length 35, got ${keys.length}`);
}

// --- Ungarbageable input -----------------------------------------------------
{
  const empty = parseFeedOccurrences(
    ics(),
    WINDOW,
  );
  assert(empty.length === 0, "empty calendar should yield no occurrences");
}

// --- T-140 agenda range + schedule-line helpers (pure) ----------------------
{
  const days = agendaDayKeys("2026-10-05", "2026-10-07");
  assert(
    days.join(",") === "2026-10-05,2026-10-06,2026-10-07",
    `agendaDayKeys: inclusive range, got ${days.join(",")}`,
  );
  assert(
    agendaDayKeys("2026-01-01", "2026-12-31").length ===
      CALENDAR_AGENDA_MAX_DAYS,
    "agendaDayKeys: caps at CALENDAR_AGENDA_MAX_DAYS",
  );

  const native = {
    source: "event" as const,
    id: "e1",
    title: "Dentist",
    start: "2026-10-05T07:30:00.000Z",
    end: "2026-10-05T08:30:00.000Z",
    all_day: false,
    calendar_name: AGENDA_NATIVE_CALENDAR_NAME,
    calendar_color: AGENDA_NATIVE_CALENDAR_COLOR,
  };
  assert(
    agendaTimeLabel(native.start, "Europe/Amsterdam") === "09:30",
    "agendaTimeLabel: renders in the household timezone",
  );
  assert(
    formatAgendaScheduleLine(native, "Europe/Amsterdam") ===
      "Dentist, from 09:30 to 10:30 (Homebase)",
    "formatAgendaScheduleLine: timed range",
  );

  const allDay = { ...native, title: "Holiday", all_day: true };
  assert(
    formatAgendaScheduleLine(allDay, "Europe/Amsterdam") ===
      "Holiday, all day (Homebase)",
    "formatAgendaScheduleLine: all day",
  );

  const point = { ...native, end: undefined, title: "Call" };
  assert(
    formatAgendaScheduleLine(point, "Europe/Amsterdam") ===
      "Call, at 09:30 (Homebase)",
    "formatAgendaScheduleLine: single instant",
  );

  const unlabeled = { ...point, calendar_name: "" };
  assert(
    formatAgendaScheduleLine(unlabeled, "Europe/Amsterdam") ===
      "Call, at 09:30",
    "formatAgendaScheduleLine: omits empty calendar name",
  );

  const lines = [
    formatAgendaScheduleLine(native, "Europe/Amsterdam"),
    formatAgendaScheduleLine(allDay, "Europe/Amsterdam"),
  ];
  assert(
    lines.every((line) => !/[^\x00-\x7F]/.test(line)),
    "schedule lines stay ASCII-safe",
  );
}

console.log("calendar selftest OK");
