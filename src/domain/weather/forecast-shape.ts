import { addDaysKey, dateKeyInTimeZone, zonedDateTimeToInstant } from "@/lib/dates";

export const SOURCE = "open-meteo/knmi";

type DayPartKey = "morning" | "afternoon" | "evening" | "night";

export interface HomeLocation {
  latitude: number;
  longitude: number;
  timezone: string;
}

export interface HourlyRow {
  time: string;
  temperature_c: number | null;
  precipitation_mm: number | null;
  conditions: string;
  weather_code: number | null;
}

export interface DayPart {
  temp_min_c: number | null;
  temp_max_c: number | null;
  precipitation_mm: number;
  conditions: string;
  weather_code: number | null;
  start: string;
  end: string;
}

export interface DaySummary {
  date: unknown;
  temp_max_c: unknown;
  temp_min_c: unknown;
  precipitation_mm: unknown;
  conditions: string;
  weather_code: unknown;
}

export interface ForecastCompact {
  location: { latitude: number; longitude: number };
  timezone: string;
  current: Record<string, unknown>;
  today: DaySummary | null;
  tomorrow: DaySummary | null;
  next_hours_precip: Array<Record<string, unknown>>;
  hourly: HourlyRow[];
  day_parts: Partial<Record<DayPartKey, DayPart>>;
  source: string;
}

export type ForecastPayload = Omit<ForecastCompact, "hourly"> & { fetched_at: string; stale: boolean };

// Higher = more severe / wetter — used when picking a representative WMO code.
const WMO_SEVERITY: Record<number, number> = {
  0: 0, 1: 1, 2: 2, 3: 3, 45: 4, 48: 5, 51: 10, 53: 12, 55: 14, 56: 16, 57: 18,
  61: 20, 63: 22, 65: 24, 66: 26, 67: 28, 71: 21, 73: 23, 75: 25, 77: 19,
  80: 21, 81: 23, 82: 27, 85: 22, 86: 26, 95: 30, 96: 32, 99: 34,
};

const WMO_LABELS: Record<number, string> = {
  0: "clear", 1: "mainly clear", 2: "partly cloudy", 3: "overcast", 45: "fog",
  48: "depositing rime fog", 51: "light drizzle", 53: "moderate drizzle",
  55: "dense drizzle", 56: "light freezing drizzle", 57: "dense freezing drizzle",
  61: "slight rain", 63: "moderate rain", 65: "heavy rain", 66: "light freezing rain",
  67: "heavy freezing rain", 71: "slight snow", 73: "moderate snow", 75: "heavy snow",
  77: "snow grains", 80: "slight rain showers", 81: "moderate rain showers",
  82: "violent rain showers", 85: "slight snow showers", 86: "heavy snow showers",
  95: "thunderstorm", 96: "thunderstorm with slight hail", 99: "thunderstorm with heavy hail",
};

function isNum(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function codeOrNull(value: unknown): number | null {
  return isNum(value) ? Math.trunc(value) : null;
}

function at<T = unknown>(list: unknown, i: number): T | null {
  return Array.isArray(list) && i < list.length ? ((list[i] ?? null) as T | null) : null;
}

export function wmoLabel(code: number | null): string {
  if (code === null) return "unknown";
  return WMO_LABELS[Math.trunc(code)] ?? `weather code ${code}`;
}

function wmoSeverity(code: number): number {
  return WMO_SEVERITY[code] ?? code;
}

function compareTuple(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

/** Prefer wetter/more severe codes when rain fell; else the modal code (Mimir _pick_conditions_code). */
export function pickConditionsCode(codes: Array<number | null>, precip: number[]): number | null {
  const usable = codes.filter(isNum).map((c) => Math.trunc(c));
  if (usable.length === 0) return null;
  const wet = precip.some((p) => isNum(p) && p > 0);
  const counts = new Map<number, number>();
  for (const c of usable) counts.set(c, (counts.get(c) ?? 0) + 1);
  const key = (c: number) => (wet ? [wmoSeverity(c), c] : [counts.get(c) ?? 0, wmoSeverity(c), c]);
  let best = usable[0];
  for (const c of usable) if (compareTuple(key(c), key(best)) > 0) best = c;
  return best;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function wall(dateKey: string, hour: number, tz: string): Date {
  const instant = zonedDateTimeToInstant(`${dateKey}T${pad2(hour)}:00`, tz);
  if (!instant) throw new Error(`invalid local time ${dateKey} ${hour}`);
  return instant;
}

/** Local date, hour and the instant the current local hour started. */
function localNow(now: Date, tz: string): { today: string; hour: number; hourStart: Date } {
  const today = dateKeyInTimeZone(now, tz);
  const hourText =
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", hour: "2-digit" })
      .formatToParts(now)
      .find((p) => p.type === "hour")?.value ?? "0";
  const hour = Number(hourText);
  return { today, hour, hourStart: wall(today, hour, tz) };
}

export function safeTimeZone(tz: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

export function hourlyRowsFromRaw(hourly: unknown): HourlyRow[] {
  const h = typeof hourly === "object" && hourly !== null ? (hourly as Record<string, unknown>) : {};
  const times = Array.isArray(h.time) ? h.time : [];
  return times.map((t, i) => {
    const code = codeOrNull(at(h.weather_code, i));
    return {
      time: String(t),
      temperature_c: at<number>(h.temperature_2m, i),
      precipitation_mm: at<number>(h.precipitation, i),
      conditions: wmoLabel(code),
      weather_code: code,
    };
  });
}

function withInstants(rows: HourlyRow[], tz: string): Array<{ row: HourlyRow; t: number }> {
  const out: Array<{ row: HourlyRow; t: number }> = [];
  for (const row of rows) {
    const instant = zonedDateTimeToInstant(row.time, tz);
    if (instant) out.push({ row, t: instant.getTime() });
  }
  return out;
}

/** Port of Mimir build_day_parts: remaining hours only, half-open local windows. */
export function buildDayParts(rows: HourlyRow[], tz: string, now: Date): Partial<Record<DayPartKey, DayPart>> {
  const { today, hour, hourStart } = localNow(now, tz);
  const tomorrow = addDaysKey(today, 1);
  const nightDate = hour < 6 ? today : tomorrow;
  const windows: Array<[DayPartKey, Date, Date]> = [
    ["morning", wall(today, 6, tz), wall(today, 12, tz)],
    ["afternoon", wall(today, 12, tz), wall(today, 18, tz)],
    ["evening", wall(today, 18, tz), wall(tomorrow, 0, tz)],
    ["night", wall(nightDate, 0, tz), wall(nightDate, 6, tz)],
  ];
  const prepared = withInstants(rows, tz);
  const parts: Partial<Record<DayPartKey, DayPart>> = {};
  for (const [key, start, end] of windows) {
    const bucket = prepared.filter(
      (p) => p.t >= hourStart.getTime() && p.t >= start.getTime() && p.t < end.getTime(),
    );
    if (bucket.length === 0) continue;
    const temps = bucket.map((p) => p.row.temperature_c).filter(isNum);
    const precip = bucket.map((p) => (isNum(p.row.precipitation_mm) ? p.row.precipitation_mm : 0));
    const code = pickConditionsCode(bucket.map((p) => p.row.weather_code), precip);
    parts[key] = {
      temp_min_c: temps.length ? Math.min(...temps) : null,
      temp_max_c: temps.length ? Math.max(...temps) : null,
      precipitation_mm: Math.round(precip.reduce((a, b) => a + b, 0) * 100) / 100,
      conditions: wmoLabel(code),
      weather_code: code,
      start: bucket[0].row.time.slice(0, 16),
      end: bucket[bucket.length - 1].row.time.slice(0, 16),
    };
  }
  return parts;
}

/** Port of Mimir trim_hourly_for_payload: now through tomorrow 06:00 local. */
export function trimHourly(rows: HourlyRow[], tz: string, now: Date): HourlyRow[] {
  const { today, hourStart } = localNow(now, tz);
  const end = wall(addDaysKey(today, 1), 6, tz).getTime();
  return withInstants(rows, tz)
    .filter((p) => p.t >= hourStart.getTime() && p.t < end)
    .map((p) => ({ ...p.row }));
}

function nextHours(rows: HourlyRow[]): Array<Record<string, unknown>> {
  return rows.slice(0, 6).map((r) => ({
    time: r.time,
    temperature_c: r.temperature_c,
    precipitation_mm: r.precipitation_mm,
    conditions: r.conditions,
  }));
}

function daySummary(daily: Record<string, unknown>, i: number): DaySummary | null {
  const dates = Array.isArray(daily.time) ? daily.time : [];
  if (i >= dates.length) return null;
  const dc = at(daily.weather_code, i);
  return {
    date: dates[i] ?? null,
    temp_max_c: at(daily.temperature_2m_max, i),
    temp_min_c: at(daily.temperature_2m_min, i),
    precipitation_mm: at(daily.precipitation_sum, i),
    conditions: wmoLabel(codeOrNull(dc)),
    weather_code: dc,
  };
}

/** Port of Mimir normalize_forecast. Without `now`, current.time is "now" (fixture stability). */
export function normalizeForecast(
  raw: Record<string, unknown>,
  home: HomeLocation,
  now?: Date,
): ForecastCompact {
  const tz = safeTimeZone(home.timezone);
  const rec = (v: unknown) => (typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {});
  const current = rec(raw.current);
  const daily = rec(raw.daily);
  let effectiveNow = now;
  if (!effectiveNow && typeof current.time === "string") {
    effectiveNow = zonedDateTimeToInstant(current.time, tz) ?? undefined;
  }
  const at0 = effectiveNow ?? new Date();
  const rows = hourlyRowsFromRaw(raw.hourly);
  const hourly = trimHourly(rows, tz, at0);
  const code = current.weather_code ?? null;
  return {
    location: { latitude: home.latitude, longitude: home.longitude },
    timezone: home.timezone,
    current: {
      time: current.time ?? null,
      temperature_c: current.temperature_2m ?? null,
      conditions: wmoLabel(codeOrNull(code)),
      weather_code: code,
      precipitation_mm: current.precipitation ?? null,
      humidity_pct: current.relative_humidity_2m ?? null,
      wind_kmh: current.wind_speed_10m ?? null,
    },
    today: daySummary(daily, 0),
    tomorrow: daySummary(daily, 1),
    next_hours_precip: nextHours(hourly),
    hourly,
    day_parts: buildDayParts(rows, tz, at0),
    source: SOURCE,
  };
}

/** Port of refresh_day_parts + the LLM payload step: recompute for `now`, drop hourly. */
export function forecastPayload(
  compact: ForecastCompact,
  now: Date,
  fetchedAt: string,
  stale: boolean,
): ForecastPayload {
  const tz = safeTimeZone(compact.timezone);
  const trimmed = trimHourly(compact.hourly, tz, now);
  return {
    location: compact.location,
    timezone: compact.timezone,
    current: compact.current,
    today: compact.today,
    tomorrow: compact.tomorrow,
    next_hours_precip: nextHours(trimmed),
    day_parts: buildDayParts(compact.hourly, tz, now),
    source: compact.source,
    fetched_at: fetchedAt,
    stale,
  };
}
