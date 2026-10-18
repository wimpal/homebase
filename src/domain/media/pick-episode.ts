import { DomainError, isDomainError } from "@/domain/error";
import { getItem, itemsOf, jellyfinGetObject, userItemsPath } from "./client";
import { episodeAvailability, episodeNumbers, pickEpisode, type EpisodePickReason } from "./episodes";
import { assertMediaReady } from "./gate";
import type { JellyfinItem } from "./types";
import { toInt } from "./util";

const EPISODE_FIELDS = "Overview,ProductionYear";

export interface PickedEpisodeRow {
  id: string;
  season: number;
  number: number;
  title: string;
  label: string;
}

export interface PickEpisodeResult {
  series: { id: string; title: string; year: number | null };
  episode: PickedEpisodeRow | null;
  reason: EpisodePickReason;
  availability: string;
}

function toEpisodeRow(e: JellyfinItem): PickedEpisodeRow {
  const [season, number] = episodeNumbers(e);
  return {
    id: String(e.Id ?? ""),
    season,
    number,
    title: String(e.Name ?? ""),
    label: `S${season}E${number}`,
  };
}

/** 0 is allowed: pickEpisode then answers season-not-found / episode-not-found, as Mimir did. */
function positiveIntOrError(value: number | undefined, field: string): number | undefined | DomainError {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 0) {
    return DomainError.invalidInput(`${field} must be a whole number.`, `invalid_${field}`);
  }
  return value;
}

export async function pickEpisodeForSeries(
  householdId: string,
  input: { seriesId: string; season?: number; episode?: number },
): Promise<PickEpisodeResult | DomainError> {
  const config = await assertMediaReady(householdId);
  if (isDomainError(config)) return config;
  const seriesId = input.seriesId.trim();
  if (!seriesId) return DomainError.invalidInput("series_id is required.", "invalid_series_id");
  const season = positiveIntOrError(input.season, "season");
  if (isDomainError(season)) return season;
  const episodeNo = positiveIntOrError(input.episode, "episode");
  if (isDomainError(episodeNo)) return episodeNo;

  const series = await getItem(config, seriesId);
  if (isDomainError(series)) return series;
  if (!series || String(series.Type ?? "") !== "Series") {
    return DomainError.notFound("Series not found in Jellyfin.", "series_not_found");
  }

  const listed = await jellyfinGetObject(config, userItemsPath(config), {
    ParentId: seriesId,
    IncludeItemTypes: "Episode",
    Recursive: "true",
    EnableUserData: "true",
    Fields: EPISODE_FIELDS,
  });
  if (isDomainError(listed)) return listed;
  const episodes = itemsOf(listed);
  if (isDomainError(episodes)) return episodes;

  let picked: JellyfinItem | null = null;
  let reason: EpisodePickReason = "no-episodes";
  if (season === undefined && episodeNo === undefined) {
    const nextUp = await jellyfinGetObject(config, "Shows/NextUp", {
      UserId: config.userId,
      SeriesId: seriesId,
      Limit: 1,
      Fields: EPISODE_FIELDS,
      EnableUserData: "true",
    });
    if (isDomainError(nextUp)) return nextUp;
    const nextItems = itemsOf(nextUp);
    if (isDomainError(nextItems)) return nextItems;
    const first = nextItems[0];
    if (first && typeof first.Id === "string" && first.Id.trim()) {
      picked = first;
      reason = "unplayed";
    }
  }
  if (!picked) {
    const result = pickEpisode(episodes, { season, episode: episodeNo });
    picked = result.episode;
    reason = result.reason;
  }

  return {
    series: { id: seriesId, title: String(series.Name ?? ""), year: toInt(series.ProductionYear) },
    episode: picked ? toEpisodeRow(picked) : null,
    reason,
    availability: episodeAvailability(episodes),
  };
}
