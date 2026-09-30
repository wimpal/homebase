/**
 * WMO weather interpretation codes -> icon + translation key.
 * Pure mapping, no network. Open-Meteo returns WMO code 4677 table
 * (https://open-meteo.com/en/docs). Unknown codes fall back to cloudy.
 */

export type WeatherKind =
  | "clear"
  | "partlyCloudy"
  | "overcast"
  | "fog"
  | "drizzle"
  | "rain"
  | "snow"
  | "showers"
  | "thunderstorm";

export interface WeatherCodeInfo {
  kind: WeatherKind;
  /** Key under `dashboard.today.weatherCodes` in the message catalogs. */
  labelKey: string;
}

/**
 * Ranges are inclusive and checked in order, so keep the coarse groups last.
 * `null` in a range means "unbounded on that side".
 */
const WMO_RANGES: ReadonlyArray<{
  from: number;
  to: number | null;
  info: WeatherCodeInfo;
}> = [
  { from: 0, to: 0, info: { kind: "clear", labelKey: "clear" } },
  { from: 1, to: 2, info: { kind: "partlyCloudy", labelKey: "mainlyClear" } },
  { from: 3, to: 3, info: { kind: "overcast", labelKey: "overcast" } },
  { from: 45, to: 48, info: { kind: "fog", labelKey: "fog" } },
  { from: 51, to: 57, info: { kind: "drizzle", labelKey: "drizzle" } },
  { from: 61, to: 67, info: { kind: "rain", labelKey: "rain" } },
  { from: 71, to: 77, info: { kind: "snow", labelKey: "snow" } },
  { from: 80, to: 82, info: { kind: "showers", labelKey: "showers" } },
  { from: 85, to: 86, info: { kind: "snow", labelKey: "snowShowers" } },
  { from: 95, to: 99, info: { kind: "thunderstorm", labelKey: "thunderstorm" } },
];

const FALLBACK: WeatherCodeInfo = { kind: "overcast", labelKey: "overcast" };

/** Map a WMO code to a coarse kind + i18n key. Never throws. */
export function describeWeatherCode(code: number): WeatherCodeInfo {
  if (!Number.isFinite(code)) return FALLBACK;
  for (const range of WMO_RANGES) {
    if (code >= range.from && (range.to === null || code <= range.to)) {
      return range.info;
    }
  }
  return FALLBACK;
}
