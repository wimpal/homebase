import type { JellyfinItem } from "./types";
import { isRecord, toInt } from "./util";

export type EpisodePickReason =
  | "requested"
  | "unplayed"
  | "no-episodes"
  | "season-not-found"
  | "episode-not-found"
  | "all-played"
  | "caught-up";

export interface EpisodePick {
  episode: JellyfinItem | null;
  reason: EpisodePickReason;
}

export function episodeNumbers(e: JellyfinItem): [number, number] {
  return [toInt(e.ParentIndexNumber) ?? 0, toInt(e.IndexNumber) ?? 0];
}

function compareNumbers(a: JellyfinItem, b: JellyfinItem): number {
  const [as, ae] = episodeNumbers(a);
  const [bs, be] = episodeNumbers(b);
  return as - bs || ae - be;
}

/** Unknown user data must not hide the only unplayed episode. */
function episodePlayed(e: JellyfinItem): boolean {
  return isRecord(e.UserData) ? Boolean(e.UserData.Played) : false;
}

/** Episodes with a real season and episode number; season 0 = specials. */
function playableEpisodes(episodes: JellyfinItem[]): JellyfinItem[] {
  const numbered = episodes.filter((e) => episodeNumbers(e).every((n) => n > 0));
  const realSeasons = numbered.filter((e) => episodeNumbers(e)[0] >= 1);
  return realSeasons.length > 0 ? realSeasons : numbered;
}

/**
 * Pick the episode to play. Port of Mimir pick_episode.
 * Default (no season/episode): continue after furthest watched.
 */
export function pickEpisode(
  episodes: JellyfinItem[],
  opts: { season?: number; episode?: number } = {},
): EpisodePick {
  const usable = playableEpisodes(episodes);
  if (usable.length === 0) {
    return { episode: null, reason: "no-episodes" };
  }

  const { season, episode } = opts;

  if (season !== undefined) {
    const bucket = usable.filter((e) => episodeNumbers(e)[0] === season);
    if (bucket.length === 0) {
      return { episode: null, reason: "season-not-found" };
    }
    if (episode !== undefined) {
      for (const e of bucket) {
        if (episodeNumbers(e)[1] === episode) {
          return { episode: e, reason: "requested" };
        }
      }
      return { episode: null, reason: "episode-not-found" };
    }
    const unplayed = bucket.filter((e) => !episodePlayed(e));
    if (unplayed.length === 0) {
      return { episode: null, reason: "all-played" };
    }
    unplayed.sort(compareNumbers);
    return { episode: unplayed[0], reason: "unplayed" };
  }

  if (episode !== undefined) {
    // Episode number without a season: first season that has that number.
    const seasons = [...new Set(usable.map((e) => episodeNumbers(e)[0]))].sort(
      (a, b) => a - b,
    );
    for (const seasonNo of seasons) {
      for (const e of usable) {
        const [s, n] = episodeNumbers(e);
        if (s === seasonNo && n === episode) {
          return { episode: e, reason: "requested" };
        }
      }
    }
    return { episode: null, reason: "episode-not-found" };
  }

  // Continue after furthest played. Skipped earlier holes must not win.
  const played = usable.filter((e) => episodePlayed(e));
  if (played.length === 0) {
    const sorted = [...usable].sort(compareNumbers);
    return { episode: sorted[0], reason: "unplayed" };
  }

  // Python max(..., key=) returns the first maximal element.
  let furthest = played[0];
  for (const e of played) {
    if (compareNumbers(e, furthest) > 0) furthest = e;
  }

  const after = usable.filter(
    (e) => compareNumbers(e, furthest) > 0 && !episodePlayed(e),
  );
  if (after.length > 0) {
    after.sort(compareNumbers);
    return { episode: after[0], reason: "unplayed" };
  }
  // Progress is past every later episode, but earlier skips remain.
  if (usable.some((e) => !episodePlayed(e))) {
    return { episode: null, reason: "caught-up" };
  }
  return { episode: null, reason: "all-played" };
}

/** Short 'what does exist' summary for loud episode failures. */
export function episodeAvailability(episodes: JellyfinItem[]): string {
  const usable = playableEpisodes(episodes);
  if (usable.length === 0) return "";
  const seasons = [...new Set(usable.map((e) => episodeNumbers(e)[0]))].sort(
    (a, b) => a - b,
  );
  if (seasons.length === 1) {
    const season = seasons[0];
    let last = 0;
    for (const e of usable) {
      const n = episodeNumbers(e)[1];
      if (n > last) last = n;
    }
    return `(S${season} has episodes 1-${last})`;
  }
  return `(seasons ${seasons[0]}-${seasons[seasons.length - 1]})`;
}
