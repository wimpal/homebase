/**
 * Current-weather adapter (Open-Meteo). Read-only, no credentials, no data
 * stored. The dashboard is the only caller today; the adapter boundary keeps
 * the provider swappable (see docs/roadmap.md "Weather forecast adapter").
 *
 * Failure is always soft: every error path returns `{ ok: false }` so a
 * provider outage can never break a page render.
 */

import { parseLatLon } from "@/domain/automations/sunset";
import { describeWeatherCode, type WeatherKind } from "./codes";

const ENDPOINT = "https://api.open-meteo.com/v1/forecast";
const REVALIDATE_SECONDS = 1800;
const TIMEOUT_MS = 5000;

export interface CurrentWeather {
  temperatureC: number;
  /** WMO code, untranslated — pass to `describeWeatherCode` at render time. */
  code: number;
  kind: WeatherKind;
  /** i18n key under `dashboard.today.weatherCodes`. */
  labelKey: string;
  highC: number | null;
  lowC: number | null;
}

export type WeatherLookupResult =
  | { ok: true; weather: CurrentWeather }
  | { ok: false; reason: string };

export type WeatherLookupInput = {
  lat: number | null | undefined;
  lon: number | null | undefined;
  /** IANA timezone; also sent to the provider so its day window matches ours. */
  timezone: string;
};

interface OpenMeteoResponse {
  current?: { temperature_2m?: unknown; weather_code?: unknown };
  daily?: { temperature_2m_max?: unknown; temperature_2m_min?: unknown };
}

/** Naive element access — some providers omit a day the household has no data for. */
function firstFinite(value: unknown): number | null {
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry === "number" && Number.isFinite(entry)) return entry;
    }
    return null;
  }
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Current temperature plus today's high/low for one coordinate pair.
 * Results are cached for 30 minutes so a dashboard refresh loop cannot
 * exhaust the provider's free tier.
 */
export async function getCurrentWeather(
  input: WeatherLookupInput,
): Promise<WeatherLookupResult> {
  const coords = parseLatLon(input.lat, input.lon);
  if (!coords) return { ok: false, reason: "invalid_coords" };

  const url = new URL(ENDPOINT);
  url.searchParams.set("latitude", String(coords.lat));
  url.searchParams.set("longitude", String(coords.lon));
  url.searchParams.set(
    "current",
    "temperature_2m,weather_code",
  );
  url.searchParams.set(
    "daily",
    "temperature_2m_max,temperature_2m_min",
  );
  url.searchParams.set("forecast_days", "1");
  url.searchParams.set("temperature_unit", "celsius");
  url.searchParams.set("timezone", input.timezone);

  let payload: OpenMeteoResponse;
  try {
    const response = await fetch(url, {
      next: { revalidate: REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return { ok: false, reason: `http_${response.status}` };
    payload = (await response.json()) as OpenMeteoResponse;
  } catch {
    return { ok: false, reason: "fetch_failed" };
  }

  const temperatureC = firstFinite(payload.current?.temperature_2m);
  if (temperatureC === null) return { ok: false, reason: "no_temperature" };

  const code = firstFinite(payload.current?.weather_code) ?? 0;
  const described = describeWeatherCode(code);

  return {
    ok: true,
    weather: {
      temperatureC,
      code,
      kind: described.kind,
      labelKey: described.labelKey,
      highC: firstFinite(payload.daily?.temperature_2m_max),
      lowC: firstFinite(payload.daily?.temperature_2m_min),
    },
  };
}
