/**
 * Self-test for the dynamic Today tile: WMO code mapping, the timezone-aware
 * `getTodayInfo`, and the WMO range boundaries. No database, no network.
 * Run: npm run today-tile:selftest
 */
import { describeWeatherCode } from "../src/domain/weather/codes";
import { getTodayInfo } from "../src/lib/utils";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

// describeWeatherCode — WMO 4677 boundaries
assert(describeWeatherCode(0).kind === "clear", "0 = clear");
assert(describeWeatherCode(1).kind === "partlyCloudy", "1 = mainly clear");
assert(describeWeatherCode(2).kind === "partlyCloudy", "2 = partly cloudy");
assert(describeWeatherCode(3).kind === "overcast", "3 = overcast");
assert(describeWeatherCode(45).kind === "fog", "45 = fog");
assert(describeWeatherCode(48).kind === "fog", "48 = depositing fog");
assert(describeWeatherCode(51).kind === "drizzle", "51 = light drizzle");
assert(describeWeatherCode(57).kind === "drizzle", "57 = dense drizzle");
assert(describeWeatherCode(61).kind === "rain", "61 = light rain");
assert(describeWeatherCode(67).kind === "rain", "67 = heavy rain");
assert(describeWeatherCode(71).kind === "snow", "71 = light snow");
assert(describeWeatherCode(77).kind === "snow", "77 = snow grains");
assert(describeWeatherCode(80).kind === "showers", "80 = light showers");
assert(describeWeatherCode(82).kind === "showers", "82 = violent showers");
assert(describeWeatherCode(85).kind === "snow", "85 = snow showers");
assert(describeWeatherCode(86).kind === "snow", "86 = heavy snow showers");
assert(describeWeatherCode(95).kind === "thunderstorm", "95 = thunderstorm");
assert(describeWeatherCode(99).kind === "thunderstorm", "99 = heavy thunderstorm");

// Unknown / out-of-table codes must not throw and must fall back
assert(describeWeatherCode(4).kind === "overcast", "gap code falls back");
assert(describeWeatherCode(123).kind === "overcast", "far-out code falls back");
assert(describeWeatherCode(NaN).kind === "overcast", "NaN falls back");
assert(
  describeWeatherCode(Number.POSITIVE_INFINITY).kind === "overcast",
  "Infinity falls back",
);

// labelKeys must be unique per kind so the i18n key is deterministic
assert(describeWeatherCode(0).labelKey === "clear", "clear labelKey");
assert(
  describeWeatherCode(85).labelKey === "snowShowers",
  "snow showers have their own labelKey",
);

// getTodayInfo — day-of-year edges
const jan1 = getTodayInfo(new Date("2026-01-01T12:00:00Z"), "UTC");
assert(jan1.dayOfYear === 1, "1 Jan is day 1");
assert(jan1.daysLeft === 364, "1 Jan leaves 364 days in a 365-day year");
assert(jan1.daysInYear === 365, "2026 is not a leap year");
assert(jan1.percentOfYear === 0, "1 Jan rounds to 0%");

const dec31 = getTodayInfo(new Date("2026-12-31T12:00:00Z"), "UTC");
assert(dec31.dayOfYear === 365, "31 Dec is day 365");
assert(dec31.daysLeft === 0, "31 Dec leaves 0 days");
assert(dec31.percentOfYear === 100, "31 Dec rounds to 100%");

const leapDay = getTodayInfo(new Date("2024-02-29T12:00:00Z"), "UTC");
assert(leapDay.dayOfYear === 60, "29 Feb 2024 is day 60");
assert(leapDay.daysInYear === 366, "2024 is a leap year");

// 1900 is NOT a leap year; 2000 IS
assert(
  getTodayInfo(new Date("1900-03-01T12:00:00Z"), "UTC").daysInYear === 365,
  "1900 is not a leap year",
);
assert(
  getTodayInfo(new Date("2000-03-01T12:00:00Z"), "UTC").daysInYear === 366,
  "2000 is a leap year",
);

// getTodayInfo — the timezone fix. 23:30 UTC is already the next day in
// Amsterdam; the server running in UTC must still report the local date.
const amsterdamLate = getTodayInfo(
  new Date("2026-09-30T22:30:00Z"),
  "Europe/Amsterdam",
);
assert(
  amsterdamLate.dayOfYear === getTodayInfo(new Date("2026-10-01T12:00:00Z"), "UTC")
    .dayOfYear,
  "CEST rollover reads the local day, not the server day",
);
assert(
  getTodayInfo(new Date("2026-09-30T21:30:00Z"), "Europe/Amsterdam").dayOfYear ===
    getTodayInfo(new Date("2026-09-30T12:00:00Z"), "UTC").dayOfYear,
  "still 30 Sep at 23:30 CEST",
);

// Year boundary is the case the old local-getter implementation got wrong
const newYearEve = getTodayInfo(
  new Date("2025-12-31T23:30:00Z"),
  "Europe/Amsterdam",
);
assert(
  newYearEve.dayOfYear === 1 && newYearEve.daysLeft === 364,
  "23:30 UTC on 31 Dec is 1 Jan locally — day 1, not day 365",
);

// DST must not shift the count (UTC arithmetic, unlike local Date getters)
const dstSpring = getTodayInfo(new Date("2026-03-29T12:00:00Z"), "Europe/Amsterdam");
const dstSpringPrev = getTodayInfo(
  new Date("2026-03-28T12:00:00Z"),
  "Europe/Amsterdam",
);
assert(
  dstSpring.dayOfYear === dstSpringPrev.dayOfYear + 1,
  "DST transition day still advances by exactly one",
);

// An invalid IANA zone must fall back, not throw
const badZone = getTodayInfo(new Date("2026-09-30T12:00:00Z"), "Not/AZone");
assert(badZone.dayOfYear === 273, "invalid zone falls back to host date");

console.log("today-tile:selftest OK");
