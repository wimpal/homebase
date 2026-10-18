import { DomainError, isDomainError } from "@/domain/error";
import type { JellyfinItem } from "./types";
import { isRecord } from "./util";

const DEFAULT_TIMEOUT_MS = 15_000;
const AUTH_HEADER =
  'MediaBrowser Client="Homebase", Device="Homebase", DeviceId="homebase-nas", Version="1.0"';

export interface JellyfinConfig {
  baseUrl: string;
  apiKey: string;
  userId: string;
  libraryIds: string[];
}

export function getJellyfinConfig(): JellyfinConfig | null {
  const url = (process.env.JELLYFIN_URL ?? "").trim();
  const apiKey = (process.env.JELLYFIN_API_KEY ?? "").trim();
  const userId = (process.env.JELLYFIN_USER_ID ?? "").trim();
  if (!url || !apiKey || !userId) return null;
  const libraryIds = (process.env.JELLYFIN_LIBRARY_IDS ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return { baseUrl: url.endsWith("/") ? url : `${url}/`, apiKey, userId, libraryIds };
}

export function isJellyfinConfigured(): boolean {
  return getJellyfinConfig() !== null;
}

export function jellyfinUnreachable(detail: string): DomainError {
  return DomainError.unavailable(`Jellyfin is unreachable (${detail}).`, "jellyfin_unreachable");
}

export type JellyfinParams = Record<string, string | number | boolean | undefined>;

export interface JellyfinResponse {
  status: number;
  body: unknown;
}

/** One HTTP call. 404 is returned to the caller; every other failure is a DomainError. */
export async function jellyfinRequest(
  config: JellyfinConfig,
  method: "GET" | "POST" | "DELETE",
  path: string,
  params: JellyfinParams = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<JellyfinResponse | DomainError> {
  const url = new URL(path, config.baseUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      cache: "no-store",
      headers: {
        "X-Emby-Token": config.apiKey,
        Accept: "application/json",
        "X-Emby-Authorization": AUTH_HEADER,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    return jellyfinUnreachable(name === "TimeoutError" || name === "AbortError" ? "timeout" : "network");
  }
  if (response.status === 404) return { status: 404, body: null };
  if (response.status >= 400) return jellyfinUnreachable(`HTTP ${response.status}`);
  const text = await response.text();
  if (!text.trim()) return { status: response.status, body: null };
  try {
    return { status: response.status, body: JSON.parse(text) as unknown };
  } catch {
    return jellyfinUnreachable("bad JSON");
  }
}

/** GET returning a JSON object (Items pages, NextUp). 404 counts as bad JSON. */
export async function jellyfinGetObject(
  config: JellyfinConfig,
  path: string,
  params: JellyfinParams = {},
): Promise<Record<string, unknown> | DomainError> {
  const res = await jellyfinRequest(config, "GET", path, params);
  if (isDomainError(res)) return res;
  if (!isRecord(res.body)) return jellyfinUnreachable("bad JSON");
  return res.body;
}

/** `Items` array of a page; non-object entries dropped. */
export function itemsOf(payload: Record<string, unknown>): JellyfinItem[] | DomainError {
  const items = payload.Items ?? [];
  if (!Array.isArray(items)) return jellyfinUnreachable("bad Items");
  return items.filter(isRecord) as JellyfinItem[];
}

export function userItemsPath(config: JellyfinConfig): string {
  return `Users/${encodeURIComponent(config.userId)}/Items`;
}

/** One item for the configured user; null when Jellyfin answers 404. */
export async function getItem(
  config: JellyfinConfig,
  itemId: string,
): Promise<JellyfinItem | null | DomainError> {
  const res = await jellyfinRequest(
    config,
    "GET",
    `${userItemsPath(config)}/${encodeURIComponent(itemId)}`,
  );
  if (isDomainError(res)) return res;
  if (res.status === 404) return null;
  if (!isRecord(res.body)) return jellyfinUnreachable("bad JSON");
  return res.body as JellyfinItem;
}
