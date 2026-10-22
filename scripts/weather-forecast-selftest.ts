/**
 * Self-test for weather forecast shaping (no network / Prisma).
 * Usage: npm run weather:forecast-selftest
 *
 * Ported from Mimir tests/test_weather.py SAMPLE_RAW + day-part cases (T-153).
 */
import {
  buildDayParts,
  forecastPayload,
  normalizeForecast,
  wmoLabel,
  type HourlyRow,
} from "../src/domain/weather/forecast-shape";

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

const HOURLY = {
  time: [
    "2026-08-25T12:00", "2026-08-25T13:00", "2026-08-25T14:00", "2026-08-25T17:00",
    "2026-08-25T18:00", "2026-08-25T19:00", "2026-08-25T21:00", "2026-08-25T23:00",
    "2026-08-26T01:00", "2026-08-26T03:00", "2026-08-26T05:00",
  ],
  temperature_2m: [20.0, 21.0, 22.0, 19.0, 17.0, 16.0, 14.0, 13.0, 12.0, 11.0, 10.5],
  precipitation: [0.0, 0.0, 0.0, 0.0, 0.2, 0.5, 0.0, 0.0, 0.0, 0.0, 0.0],
  weather_code: [1, 1, 2, 2, 61, 63, 3, 3, 45, 45, 3],
};
const SAMPLE_RAW = {
  current: {
    time: "2026-08-25T12:00",
    temperature_2m: 18.5,
    relative_humidity_2m: 72,
    precipitation: 0.2,
    weather_code: 61,
    wind_speed_10m: 15.0,
  },
  daily: {
    time: ["2026-08-25", "2026-08-26"],
    temperature_2m_max: [20.0, 22.0],
    temperature_2m_min: [12.0, 13.0],
    precipitation_sum: [1.5, 0.0],
    weather_code: [61, 1],
  },
  hourly: HOURLY,
};
const HOME = { latitude: 52.09, longitude: 5.12, timezone: "Europe/Amsterdam" };

// W1
assert(wmoLabel(0) === "clear", "W1 clear");
assert(wmoLabel(61) === "slight rain", "W1 slight rain");
assert(wmoLabel(999).includes("999"), "W1 unknown code contains 999");
assert(wmoLabel(null) === "unknown", "W1 null → unknown");

// W2
const n2 = normalizeForecast(SAMPLE_RAW, HOME);
assert(n2.source === "open-meteo/knmi", "W2 source");
assert(n2.current.temperature_c === 18.5, "W2 current temp");
assert(n2.current.conditions === "slight rain", "W2 current conditions");
assert(n2.today?.date === "2026-08-25", "W2 today date");
assert(n2.today?.precipitation_mm === 1.5, "W2 today precip");
assert(n2.tomorrow?.temp_max_c === 22, "W2 tomorrow max");
assert(n2.tomorrow?.conditions === "mainly clear", "W2 tomorrow conditions");
assert(n2.next_hours_precip.length === 6, "W2 next_hours length");
assert(n2.next_hours_precip[0]?.temperature_c === 20, "W2 next_hours[0] temp");
assert(n2.day_parts.evening?.temp_max_c === 17, "W2 evening max");
assert(n2.day_parts.evening?.temp_min_c === 13, "W2 evening min");
assert(n2.day_parts.afternoon !== undefined, "W2 afternoon present");

// W3 — local Amsterdam times are CEST (UTC+2)
const w3 = buildDayParts(
  [
    {
      time: "2026-08-25T17:00",
      temperature_c: 19,
      precipitation_mm: 0,
      conditions: "",
      weather_code: 2,
    },
    {
      time: "2026-08-25T18:00",
      temperature_c: 15,
      precipitation_mm: 0,
      conditions: "",
      weather_code: 3,
    },
  ],
  "Europe/Amsterdam",
  new Date("2026-08-25T15:59:00Z"),
);
assert(w3.afternoon?.temp_max_c === 19, "W3 afternoon max");
assert(w3.evening?.temp_max_c === 15, "W3 evening max");

// W4 — 21:00 local
const n4 = normalizeForecast(SAMPLE_RAW, HOME, new Date("2026-08-25T19:00:00Z"));
assert(n4.day_parts.evening?.start === "2026-08-25T21:00", "W4 evening start");
assert(n4.day_parts.evening?.temp_max_c === 14, "W4 evening max");
assert(n4.day_parts.evening?.temp_min_c === 13, "W4 evening min");
assert(n4.day_parts.afternoon === undefined, "W4 no afternoon");

// W5 — 01:00 local 26 Aug
const n5 = normalizeForecast(SAMPLE_RAW, HOME, new Date("2026-08-25T23:00:00Z"));
assert(n5.day_parts.night?.temp_min_c === 10.5, "W5 night min");

// W6
const w6Rows: HourlyRow[] = [1, 3, 5, 8, 14, 18, 21].map((hour) => ({
  time: `2026-08-26T${String(hour).padStart(2, "0")}:00`,
  temperature_c: 10 + hour,
  precipitation_mm: 0,
  conditions: "clear",
  weather_code: 0,
}));
const w6 = buildDayParts(w6Rows, "Europe/Amsterdam", new Date("2026-08-25T23:00:00Z"));
assert(w6.night !== undefined, "W6 night");
assert(w6.morning !== undefined, "W6 morning");
assert(w6.afternoon !== undefined, "W6 afternoon");
assert(w6.evening !== undefined, "W6 evening");
assert(w6.evening?.temp_min_c === 28, "W6 evening min");

// W7
const compact = normalizeForecast(SAMPLE_RAW, HOME, new Date("2026-08-25T10:00:00Z"));
const payload = forecastPayload(
  compact,
  new Date("2026-08-25T18:00:00Z"),
  "2026-08-25T10:00:00.000Z",
  true,
);
assert(payload.day_parts.afternoon === undefined, "W7 no afternoon");
assert(payload.day_parts.evening?.start === "2026-08-25T21:00", "W7 evening start");
assert(payload.stale === true, "W7 stale");
assert(!("hourly" in payload), "W7 no hourly key");

// W8
const empty = normalizeForecast(
  { current: {}, daily: {}, hourly: {} },
  HOME,
  new Date(),
);
assert(empty.current.temperature_c === null, "W8 null temp key present");
assert(empty.today === null, "W8 today null");
assert(Object.keys(empty.day_parts).length === 0, "W8 empty day_parts");

console.log("OK: weather forecast selftest");
