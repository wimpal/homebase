import { DomainError, isDomainError } from "@/domain/error";
import { itemsOf, jellyfinGetObject, userItemsPath, type JellyfinConfig } from "./client";
import { MEDIA_LOOKUP_FIELDS, publicRow, type MediaRow } from "./find";
import { assertMediaReady } from "./gate";
import type { JellyfinItem } from "./types";
import { isRecord, toInt } from "./util";

const CONTINUE_LIMIT = 25;
const EPISODE_FIELDS = "Overview,ProductionYear";
const NOTE_EMPTY = "nothing part-watched";
const NOTE_READ_ONLY =
  "read-only list; does not start or continue playback (use the TV play path for that)";
const NOTE_TRUNCATED =
  "results may be truncated at the per-source limit; do not claim the household has nothing else in progress";

export interface ContinueSeriesRow {
  kind: "series";
  id: string;
  title: string;
  year: null;
  next_episode: { id: string; label: string; title: string };
}

export type ContinueRow = MediaRow | ContinueSeriesRow;

export interface ContinueWatchingPayload {
  count: number;
  results: ContinueRow[];
  notes: string[];
  empty: boolean;
  truncated: boolean;
}

function lastPlayedKey(raw: JellyfinItem): [number, string] {
  const ud = raw.UserData;
  if (isRecord(ud) && typeof ud.LastPlayedDate === "string" && ud.LastPlayedDate.trim()) {
    return [1, ud.LastPlayedDate.trim()];
  }
  return [0, ""];
}

function episodeLabel(raw: JellyfinItem): string | null {
  const season = toInt(raw.ParentIndexNumber);
  const episode = toInt(raw.IndexNumber);
  if (season === null || episode === null) return null;
  return `S${season}E${episode}`;
}

export function movieRow(raw: JellyfinItem): MediaRow | null {
  const row = publicRow(raw);
  if (!row || row.kind !== "movie") return null;
  const ticks = isRecord(raw.UserData) ? (toInt(raw.UserData.PlaybackPositionTicks) ?? 0) : 0;
  if (ticks > 0) row.resume_position_ticks = ticks;
  return row;
}

export function seriesRowFromNextUp(raw: JellyfinItem): ContinueSeriesRow | null {
  if (String(raw.Type ?? "") !== "Episode") return null;
  if (!raw.SeriesId || !raw.SeriesName || !raw.Id) return null;
  const label = episodeLabel(raw);
  if (!label) return null;
  // Episode ProductionYear is not the series year — omit rather than mislabel.
  return {
    kind: "series",
    id: String(raw.SeriesId),
    title: String(raw.SeriesName),
    year: null,
    next_episode: { id: String(raw.Id), label, title: raw.Name ? String(raw.Name) : "" },
  };
}

/** Port of the shaping half of Mimir list_continue_watching. */
export function shapeContinueWatching(
  moviesRaw: JellyfinItem[],
  nextUpRaw: JellyfinItem[],
  limit: number = CONTINUE_LIMIT,
): ContinueWatchingPayload {
  const truncated = moviesRaw.length >= limit || nextUpRaw.length >= limit;
  const tagged: Array<{ key: [number, string]; row: ContinueRow }> = [];
  for (const raw of moviesRaw) {
    const row = movieRow(raw);
    if (row) tagged.push({ key: lastPlayedKey(raw), row });
  }
  for (const raw of nextUpRaw) {
    const row = seriesRowFromNextUp(raw);
    if (row) tagged.push({ key: lastPlayedKey(raw), row });
  }
  // Most recent first; equal keys keep input order (Python sort is stable with reverse=True).
  tagged.sort(
    (a, b) =>
      b.key[0] - a.key[0] || (a.key[1] < b.key[1] ? 1 : a.key[1] > b.key[1] ? -1 : 0),
  );
  const results = tagged.map((t) => t.row);
  const empty = results.length === 0;
  const notes = [NOTE_READ_ONLY];
  if (empty) notes.push(NOTE_EMPTY);
  if (truncated) notes.push(NOTE_TRUNCATED);
  return { count: results.length, results, notes, empty, truncated };
}

async function listResumeMovies(config: JellyfinConfig): Promise<JellyfinItem[] | DomainError> {
  const payload = await jellyfinGetObject(config, `${userItemsPath(config)}/Resume`, {
    IncludeItemTypes: "Movie",
    EnableUserData: "true",
    Fields: MEDIA_LOOKUP_FIELDS,
    Limit: CONTINUE_LIMIT,
  });
  if (isDomainError(payload)) return payload;
  const items = itemsOf(payload);
  if (isDomainError(items)) return items;
  return items.filter((raw) => {
    if (String(raw.Type ?? "") !== "Movie") return false;
    const ticks = isRecord(raw.UserData) ? (toInt(raw.UserData.PlaybackPositionTicks) ?? 0) : 0;
    return ticks > 0;
  });
}

async function listNextUp(config: JellyfinConfig): Promise<JellyfinItem[] | DomainError> {
  const payload = await jellyfinGetObject(config, "Shows/NextUp", {
    UserId: config.userId,
    Limit: CONTINUE_LIMIT,
    Fields: EPISODE_FIELDS,
    EnableUserData: "true",
  });
  if (isDomainError(payload)) return payload;
  return itemsOf(payload);
}

export async function getContinueWatching(
  householdId: string,
): Promise<ContinueWatchingPayload | DomainError> {
  const config = await assertMediaReady(householdId);
  if (isDomainError(config)) return config;
  const movies = await listResumeMovies(config);
  if (isDomainError(movies)) return movies;
  const nextUp = await listNextUp(config);
  if (isDomainError(nextUp)) return nextUp;
  return shapeContinueWatching(movies, nextUp);
}
