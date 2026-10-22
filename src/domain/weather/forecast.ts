import { prisma } from "@/core/db";
import { parseLatLon } from "@/domain/automations/sunset";
import { DomainError } from "@/domain/error";
import {
  forecastPayload,
  normalizeForecast,
  type ForecastCompact,
  type ForecastPayload,
  type HomeLocation,
} from "./forecast-shape";

const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";
const KNMI_MODEL = "knmi_harmonie_arome_netherlands";
const FETCH_TIMEOUT_MS = 8_000;
const STALE_MAX_AGE_MS = 3_600_000;

// Last good forecast per home, in process memory. Lost on restart (accepted).
const lastGood = new Map<string, { compact: ForecastCompact; fetchedAt: string; fetchedMs: number }>();

async function fetchOpenMeteo(
  home: HomeLocation,
  fetchImpl: typeof fetch,
): Promise<Record<string, unknown> | string> {
  const url = new URL(OPEN_METEO_URL);
  url.searchParams.set("latitude", String(home.latitude));
  url.searchParams.set("longitude", String(home.longitude));
  url.searchParams.set("timezone", home.timezone);
  url.searchParams.set("models", KNMI_MODEL);
  url.searchParams.set("temperature_unit", "celsius");
  url.searchParams.set("wind_speed_unit", "kmh");
  url.searchParams.set("precipitation_unit", "mm");
  url.searchParams.set("forecast_days", "2");
  url.searchParams.set(
    "current",
    "temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m",
  );
  url.searchParams.set(
    "daily",
    "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum",
  );
  url.searchParams.set("hourly", "temperature_2m,precipitation,weather_code");
  try {
    const response = await fetchImpl(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return `HTTP ${response.status}`;
    const data = (await response.json()) as unknown;
    if (typeof data !== "object" || data === null || Array.isArray(data)) return "bad response";
    return data as Record<string, unknown>;
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "TimeoutError" || name === "AbortError") return "timeout";
    if (name === "SyntaxError") return "bad response";
    return "network";
  }
}

export async function getWeatherForecast(
  householdId: string,
  deps: { fetchImpl?: typeof fetch; now?: Date } = {},
): Promise<ForecastPayload | DomainError> {
  const household = await prisma.household.findUnique({
    where: { id: householdId },
    select: { latitude: true, longitude: true, timezone: true },
  });
  if (!household) return DomainError.notFound("Household not found.", "household_not_found");
  const coords = parseLatLon(household.latitude, household.longitude);
  // retryable = false on both failures: Mimir's bridge must not call twice
  // (two 8 s provider timeouts would exceed its wall clock).
  if (!coords) {
    return new DomainError(
      "unavailable",
      "Household location is not set (latitude/longitude).",
      false,
      "no_coords",
    );
  }
  const home: HomeLocation = {
    latitude: coords.lat,
    longitude: coords.lon,
    timezone: household.timezone || "Europe/Amsterdam",
  };
  const key = `${home.latitude},${home.longitude},${home.timezone}`;
  const now = deps.now ?? new Date();

  const fetched = await fetchOpenMeteo(home, deps.fetchImpl ?? fetch);
  if (typeof fetched === "string") {
    const cached = lastGood.get(key);
    if (cached && now.getTime() - cached.fetchedMs <= STALE_MAX_AGE_MS) {
      return forecastPayload(cached.compact, now, cached.fetchedAt, true);
    }
    return new DomainError("unavailable", `Weather unavailable (${fetched}).`, false, "weather_unavailable");
  }

  const compact = normalizeForecast(fetched, home, now);
  const fetchedAt = now.toISOString();
  lastGood.set(key, { compact, fetchedAt, fetchedMs: now.getTime() });
  return forecastPayload(compact, now, fetchedAt, false);
}
