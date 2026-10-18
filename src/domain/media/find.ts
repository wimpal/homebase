import { DomainError, isDomainError } from "@/domain/error";
import { itemsOf, jellyfinGetObject, userItemsPath, type JellyfinConfig } from "./client";
import { assertMediaReady } from "./gate";
import type { JellyfinItem } from "./types";
import { isRecord, toInt } from "./util";

const TICKS_PER_MINUTE = 600_000_000;
export const MEDIA_LOOKUP_FIELDS = "Overview,Genres,ProductionYear,RunTimeTicks,UserData";
export const PAGE_SIZE = 100;
const FIND_MAX_PAGES = 3;

const NOTES_SERIES_RUNTIME =
  "series total_runtime_minutes is Jellyfin's RunTimeTicks when present; often missing or episode-length — not comparable to max_minutes";
const NOTES_SERIES_PLAYED_OMITTED =
  "series watched state omitted: Played=false is ambiguous (never vs partial)";
const NOTES_TRUNCATED = "results truncated; do not claim a title is absent from the library";
const NOTES_TITLE_AND_CEILING =
  "within_max_minutes is false when a title match exceeds max_minutes; count:0 still means no title match, not 'too long'";

export interface MediaRow {
  kind: "movie" | "series";
  id: string;
  title: string;
  year: number | null;
  runtime_minutes?: number;
  played?: boolean;
  total_runtime_minutes?: number;
  within_max_minutes?: boolean;
  resume_position_ticks?: number;
}

export interface FindMediaPayload {
  query: { title: string | null; max_minutes: number | null };
  count: number;
  results: MediaRow[];
  notes: string[];
  truncated: boolean;
}

export function ticksToMinutes(ticks: unknown): number | null {
  const n = toInt(ticks);
  if (n === null || n <= 0) return null;
  return Math.max(1, Math.round(n / TICKS_PER_MINUTE));
}

/** Port of Mimir media_lookup._public_row. */
export function publicRow(raw: JellyfinItem): MediaRow | null {
  const type = String(raw.Type ?? "").trim();
  const kind = type === "Movie" ? "movie" : type === "Series" ? "series" : null;
  if (!kind || !raw.Id || !raw.Name) return null;
  const row: MediaRow = {
    kind,
    id: String(raw.Id),
    title: String(raw.Name),
    year: toInt(raw.ProductionYear),
  };
  const runtime = ticksToMinutes(raw.RunTimeTicks);
  if (kind === "movie") {
    if (runtime !== null) row.runtime_minutes = runtime;
    row.played =
      isRecord(raw.UserData) && "Played" in raw.UserData ? Boolean(raw.UserData.Played) : false;
  } else if (runtime !== null) {
    // Series: never report played (false is ambiguous). Runtime only when present.
    row.total_runtime_minutes = runtime;
  }
  return row;
}

/** Exact case-insensitive title first, then by name (Mimir find_media order). */
export function sortExactFirst(items: JellyfinItem[], needle: string): JellyfinItem[] {
  const lower = needle.toLowerCase();
  const key = (raw: JellyfinItem): [number, string] => {
    const name = String(raw.Name ?? "").toLowerCase();
    return [name === lower ? 0 : 1, name];
  };
  return [...items].sort((a, b) => {
    const [ea, na] = key(a);
    const [eb, nb] = key(b);
    return ea - eb || (na < nb ? -1 : na > nb ? 1 : 0);
  });
}

/** Port of the shaping half of Mimir find_media_in_library. */
export function shapeFindPayload(
  raws: JellyfinItem[],
  truncated: boolean,
  needle: string | null,
  ceiling: number | null,
): FindMediaPayload {
  const results: MediaRow[] = [];
  for (const raw of raws) {
    const row = publicRow(raw);
    if (!row) continue;
    if (ceiling !== null && row.kind === "movie") {
      const runtime = row.runtime_minutes;
      if (runtime === undefined || runtime > ceiling) {
        // Ceiling-only drops over-limit films; title + ceiling keeps them and marks the miss.
        if (needle === null) continue;
        row.within_max_minutes = false;
      } else {
        row.within_max_minutes = true;
      }
    }
    results.push(row);
  }
  const notes = [NOTES_SERIES_RUNTIME, NOTES_SERIES_PLAYED_OMITTED];
  if (truncated) notes.push(NOTES_TRUNCATED);
  if (ceiling !== null && needle !== null) notes.push(NOTES_TITLE_AND_CEILING);
  return {
    query: { title: needle, max_minutes: ceiling },
    count: results.length,
    results,
    notes,
    truncated,
  };
}

/** Paged `Users/{id}/Items` read with Mimir's truncation rule (find_media / list_played_movies). */
export async function fetchPagedItems(
  config: JellyfinConfig,
  params: Record<string, string>,
  maxPages: number,
): Promise<{ items: JellyfinItem[]; truncated: boolean } | DomainError> {
  const collected: JellyfinItem[] = [];
  let start = 0;
  let total: number | null = null;
  for (let page = 0; page < maxPages; page++) {
    const payload = await jellyfinGetObject(config, userItemsPath(config), {
      ...params,
      StartIndex: start,
      Limit: PAGE_SIZE,
    });
    if (isDomainError(payload)) return payload;
    const items = itemsOf(payload);
    if (isDomainError(items)) return items;
    if (typeof payload.TotalRecordCount === "number" && Number.isInteger(payload.TotalRecordCount)) {
      total = payload.TotalRecordCount;
    }
    collected.push(...items);
    start += items.length;
    if (items.length < PAGE_SIZE) break;
    if (total !== null && start >= total) break;
  }
  let truncated = total !== null && collected.length < total;
  if (!truncated && collected.length >= PAGE_SIZE * maxPages) {
    truncated = total === null || total > collected.length;
  }
  return { items: collected, truncated };
}

export async function findMedia(
  householdId: string,
  input: { title?: string; max_minutes?: number },
): Promise<FindMediaPayload | DomainError> {
  const needle = (input.title ?? "").trim() || null;
  let ceiling: number | null = null;
  if (input.max_minutes !== undefined && input.max_minutes !== null) {
    if (!Number.isFinite(input.max_minutes) || Math.trunc(input.max_minutes) < 1) {
      return DomainError.invalidInput("max_minutes must be a positive integer", "invalid_max_minutes");
    }
    ceiling = Math.trunc(input.max_minutes);
  }
  if (needle === null && ceiling === null) {
    return DomainError.invalidInput(
      "pass title and/or max_minutes (both omitted is not a valid call)",
      "missing_query",
    );
  }
  const config = await assertMediaReady(householdId);
  if (isDomainError(config)) return config;

  // max_minutes-only → films only (series must never be ranked under the ceiling).
  const params: Record<string, string> = {
    IncludeItemTypes: needle !== null ? "Movie,Series" : "Movie",
    Recursive: "true",
    EnableUserData: "true",
    Fields: MEDIA_LOOKUP_FIELDS,
  };
  if (needle !== null) params.SearchTerm = needle;
  const fetched = await fetchPagedItems(config, params, FIND_MAX_PAGES);
  if (isDomainError(fetched)) return fetched;
  const ordered = needle !== null ? sortExactFirst(fetched.items, needle) : fetched.items;
  return shapeFindPayload(ordered, fetched.truncated, needle, ceiling);
}
