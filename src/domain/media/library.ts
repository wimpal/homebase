import { DomainError, isDomainError } from "@/domain/error";
import { itemsOf, jellyfinGetObject, userItemsPath, type JellyfinConfig } from "./client";
import { assertMediaReady } from "./gate";
import type { JellyfinItem } from "./types";
import { isRecord, normalizeJellyfinDate, toInt } from "./util";

const FILM_FIELDS = "Overview,Genres,People,CommunityRating,OfficialRating,ProductionYear";
const FILMS_DEFAULT_PAGE = 100;
const FILMS_MAX_PAGE = 200;
const BOX_SETS_DEFAULT_PAGE = 25;
const BOX_SETS_MAX_PAGE = 50;
const MEMBER_PAGE = 200;
const FILMS_CURSOR_RE = /^f:(\d+):(\d+)$/;
const BOX_SETS_CURSOR_RE = /^b:(\d+)$/;

export interface LibraryFilmRow {
  id: string;
  name: string;
  year: number | null;
  overview: string | null;
  director: string | null;
  cast: string[];
  genres: string[];
  community_rating: number | null;
  official_rating: string | null;
  played: boolean;
  playback_position_ticks: number;
  last_played_at: string | null;
}

export interface LibraryBoxSetRow {
  id: string;
  name: string;
  movie_ids: string[];
}

export type LibraryPage =
  | { kind: "films"; items: LibraryFilmRow[]; next_cursor: string | null; total: number | null }
  | { kind: "box_sets"; items: LibraryBoxSetRow[]; next_cursor: string | null; total: number | null };

/** Port of Mimir jellyfin_client._people: first Director, up to 5 Actors. */
function people(raw: unknown): { director: string | null; cast: string[] } {
  let director: string | null = null;
  const cast: string[] = [];
  if (!Array.isArray(raw)) return { director, cast };
  for (const person of raw) {
    if (!isRecord(person)) continue;
    const name = String(person.Name ?? "").trim();
    if (!name) continue;
    const role = String(person.Type ?? "").toLowerCase();
    if (role === "director" && director === null) director = name;
    else if (role === "actor" && cast.length < 5) cast.push(name);
  }
  return { director, cast };
}

function finiteOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Port of Mimir jellyfin_client.normalize_item → catalogue film row. */
export function libraryFilmRow(raw: JellyfinItem): LibraryFilmRow | null {
  if (!raw.Id || !raw.Name) return null;
  const { director, cast } = people(raw.People);
  const genres = Array.isArray(raw.Genres)
    ? raw.Genres.map((g) => String(g).trim()).filter(Boolean)
    : [];
  const ud = isRecord(raw.UserData) ? raw.UserData : null;
  return {
    id: String(raw.Id),
    name: String(raw.Name),
    year: toInt(raw.ProductionYear),
    overview: raw.Overview === null || raw.Overview === undefined ? null : String(raw.Overview),
    director,
    cast,
    genres,
    community_rating: finiteOrNull(raw.CommunityRating),
    official_rating:
      raw.OfficialRating === null || raw.OfficialRating === undefined ? null : String(raw.OfficialRating),
    played: ud ? Boolean(ud.Played) : false,
    playback_position_ticks: ud ? (toInt(ud.PlaybackPositionTicks) ?? 0) : 0,
    last_played_at: normalizeJellyfinDate(ud ? ud.LastPlayedDate : null),
  };
}

function totalOf(payload: Record<string, unknown>): number | null {
  return typeof payload.TotalRecordCount === "number" && Number.isInteger(payload.TotalRecordCount)
    ? payload.TotalRecordCount
    : null;
}

function pageSizeOrError(value: number | undefined, fallback: number, max: number): number | DomainError {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1 || value > max) {
    return DomainError.invalidInput(`page_size must be an integer from 1 to ${max}`, "invalid_page_size");
  }
  return value;
}

function invalidCursor(): DomainError {
  return DomainError.invalidInput("cursor is not valid for this kind", "invalid_cursor");
}

async function readFilmsPage(
  config: JellyfinConfig,
  libIndex: number,
  start: number,
  pageSize: number,
): Promise<LibraryPage | DomainError> {
  const libraries: Array<string | null> = config.libraryIds.length > 0 ? config.libraryIds : [null];
  if (libIndex >= libraries.length) return invalidCursor();
  const parentId = libraries[libIndex];
  const params: Record<string, string | number> = {
    IncludeItemTypes: "Movie",
    Recursive: "true",
    EnableUserData: "true",
    Fields: FILM_FIELDS,
    SortBy: "SortName",
    SortOrder: "Ascending",
    StartIndex: start,
    Limit: pageSize,
  };
  if (parentId !== null) params.ParentId = parentId;
  const payload = await jellyfinGetObject(config, userItemsPath(config), params);
  if (isDomainError(payload)) return payload;
  const raws = itemsOf(payload);
  if (isDomainError(raws)) return raws;
  const total = totalOf(payload);
  const items = raws.map(libraryFilmRow).filter((r): r is LibraryFilmRow => r !== null);
  const nextStart = start + raws.length;
  const libraryDone = raws.length < pageSize || (total !== null && nextStart >= total);
  const nextCursor = !libraryDone
    ? `f:${libIndex}:${nextStart}`
    : libIndex + 1 < libraries.length
      ? `f:${libIndex + 1}:0`
      : null;
  return { kind: "films", items, next_cursor: nextCursor, total };
}

async function boxSetMovieIds(config: JellyfinConfig, boxSetId: string): Promise<string[] | DomainError> {
  const ids: string[] = [];
  let start = 0;
  for (;;) {
    const payload = await jellyfinGetObject(config, userItemsPath(config), {
      ParentId: boxSetId,
      IncludeItemTypes: "Movie",
      Recursive: "true",
      StartIndex: start,
      Limit: MEMBER_PAGE,
    });
    if (isDomainError(payload)) return payload;
    const raws = itemsOf(payload);
    if (isDomainError(raws)) return raws;
    for (const raw of raws) if (raw.Id) ids.push(String(raw.Id));
    const total = totalOf(payload);
    start += raws.length;
    if (raws.length < MEMBER_PAGE) break;
    if (total !== null && start >= total) break;
  }
  return ids;
}

async function readBoxSetsPage(
  config: JellyfinConfig,
  start: number,
  pageSize: number,
): Promise<LibraryPage | DomainError> {
  const payload = await jellyfinGetObject(config, userItemsPath(config), {
    IncludeItemTypes: "BoxSet",
    Recursive: "true",
    SortBy: "SortName",
    SortOrder: "Ascending",
    StartIndex: start,
    Limit: pageSize,
  });
  if (isDomainError(payload)) return payload;
  const raws = itemsOf(payload);
  if (isDomainError(raws)) return raws;
  const items: LibraryBoxSetRow[] = [];
  for (const raw of raws) {
    if (!raw.Id || !raw.Name) continue;
    const movieIds = await boxSetMovieIds(config, String(raw.Id));
    if (isDomainError(movieIds)) return movieIds;
    items.push({ id: String(raw.Id), name: String(raw.Name), movie_ids: movieIds });
  }
  const total = totalOf(payload);
  const nextStart = start + raws.length;
  const done = raws.length < pageSize || (total !== null && nextStart >= total);
  return { kind: "box_sets", items, next_cursor: done ? null : `b:${nextStart}`, total };
}

export async function readLibraryPage(
  householdId: string,
  input: { kind: string; cursor?: string; page_size?: number },
): Promise<LibraryPage | DomainError> {
  if (input.kind !== "films" && input.kind !== "box_sets") {
    return DomainError.invalidInput('kind must be "films" or "box_sets"', "invalid_kind");
  }
  const isFilms = input.kind === "films";
  const pageSize = isFilms
    ? pageSizeOrError(input.page_size, FILMS_DEFAULT_PAGE, FILMS_MAX_PAGE)
    : pageSizeOrError(input.page_size, BOX_SETS_DEFAULT_PAGE, BOX_SETS_MAX_PAGE);
  if (isDomainError(pageSize)) return pageSize;

  let libIndex = 0;
  let start = 0;
  if (input.cursor !== undefined && input.cursor !== "") {
    const match = (isFilms ? FILMS_CURSOR_RE : BOX_SETS_CURSOR_RE).exec(input.cursor);
    if (!match) return invalidCursor();
    if (isFilms) {
      libIndex = Number(match[1]);
      start = Number(match[2]);
    } else {
      start = Number(match[1]);
    }
  }

  const config = await assertMediaReady(householdId);
  if (isDomainError(config)) return config;
  return isFilms
    ? readFilmsPage(config, libIndex, start, pageSize)
    : readBoxSetsPage(config, start, pageSize);
}
