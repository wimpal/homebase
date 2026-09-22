import * as SunCalc from "suncalc";
import { AUTOMATION_TIMEZONE_V1 } from "./types";

export type SunsetLookupInput = {
  lat: number;
  lon: number;
  /** Instant whose local calendar day is used for the sunset calculation. */
  when: Date;
  /** IANA timezone for formatting the result (rule timezone). */
  timezone?: string;
};

export type SunsetLookupResult =
  | { ok: true; sunsetHhMm: string }
  | { ok: false; reason: string };

/**
 * Validate finite geographic coordinates.
 */
export function isValidLatLon(
  lat: unknown,
  lon: unknown,
): lat is number {
  return (
    typeof lat === "number" &&
    typeof lon === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

/** Narrow household coords to a pair, or null. */
export function parseLatLon(
  lat: unknown,
  lon: unknown,
): { lat: number; lon: number } | null {
  if (!isValidLatLon(lat, lon)) return null;
  return { lat, lon: lon as number };
}

/**
 * Local sunset as HH:MM in the given timezone for the local calendar day of `when`.
 */
export function getLocalSunsetHhMm(
  input: SunsetLookupInput,
): SunsetLookupResult {
  const { lat, lon, when } = input;
  const timezone = input.timezone ?? AUTOMATION_TIMEZONE_V1;

  if (!isValidLatLon(lat, lon)) {
    return { ok: false, reason: "invalid_coords" };
  }

  // Use noon UTC on the local calendar day so polar edge cases are less likely
  // to flip the wrong day's sunset when called near midnight.
  const localDate = localYmd(when, timezone);
  if (!localDate) {
    return { ok: false, reason: "invalid_timezone" };
  }
  const noonUtc = new Date(
    Date.UTC(localDate.year, localDate.month - 1, localDate.day, 12, 0, 0),
  );

  let sunset: Date | null | undefined;
  try {
    const times = SunCalc.getTimes(noonUtc, lat, lon);
    sunset = times.sunset;
  } catch {
    return { ok: false, reason: "suncalc_error" };
  }

  if (!(sunset instanceof Date) || Number.isNaN(sunset.getTime())) {
    return { ok: false, reason: "no_sunset" };
  }

  const hhMm = formatHhMm(sunset, timezone);
  if (!hhMm) {
    return { ok: false, reason: "format_error" };
  }
  return { ok: true, sunsetHhMm: hhMm };
}

/**
 * Subtract minutes from an HH:MM wall clock. If the result crosses midnight,
 * clamp to 00:00 (evening-lights use case; extreme offsets are rejected upstream).
 */
export function applyMinutesBefore(
  sunsetHhMm: string,
  minutesBefore: number,
): string {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(sunsetHhMm);
  if (!match) {
    throw new Error(`Invalid sunset HH:MM: ${sunsetHhMm}`);
  }
  const total =
    Number(match[1]) * 60 + Number(match[2]) - Math.max(0, minutesBefore);
  const clamped = Math.max(0, total);
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function localYmd(
  when: Date,
  timeZone: string,
): { year: number; month: number; day: number } | null {
  try {
    const dtf = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = dtf.formatToParts(when);
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((p) => p.type === type)?.value ?? "";
    const year = Number(get("year"));
    const month = Number(get("month"));
    const day = Number(get("day"));
    if (![year, month, day].every((n) => Number.isFinite(n) && n > 0)) {
      return null;
    }
    return { year, month, day };
  } catch {
    return null;
  }
}

function formatHhMm(when: Date, timeZone: string): string | null {
  try {
    const dtf = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    const parts = dtf.formatToParts(when);
    const hour = parts.find((p) => p.type === "hour")?.value ?? "";
    const minute = parts.find((p) => p.type === "minute")?.value ?? "";
    if (!hour || !minute) return null;
    return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
  } catch {
    return null;
  }
}
