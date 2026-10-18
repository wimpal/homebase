/**
 * Self-test for media episode pick + webOS session matching + T-150 shaping (no live Jellyfin).
 * Usage: npm run media:selftest
 */
import { isDomainError } from "../src/domain/error";
import {
  shapeContinueWatching,
} from "../src/domain/media/continue-watching";
import {
  episodeAvailability,
  pickEpisode,
} from "../src/domain/media/episodes";
import {
  publicRow,
  shapeFindPayload,
  sortExactFirst,
} from "../src/domain/media/find";
import {
  matchWebosControllableSessions,
  waitForUniqueTvSession,
} from "../src/domain/media/sessions";
import {
  resolveStatsWindow,
  shapeStats,
} from "../src/domain/media/stats";
import type { JellyfinItem, JellyfinSession } from "../src/domain/media/types";
import { normalizeJellyfinDate } from "../src/domain/media/util";

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

function ep(season: number, number: number, played?: boolean): JellyfinItem {
  return {
    Id: `ep-${season}-${number}`,
    Name: `Episode ${number}`,
    ParentIndexNumber: season,
    IndexNumber: number,
    UserData: { Played: played ?? false },
  };
}

const bear = [ep(1, 1, true), ep(1, 2, true), ep(1, 3), ep(2, 1)];
const cfg = {
  baseUrl: "http://jf.invalid/",
  apiKey: "x",
  userId: "u",
  libraryIds: [] as string[],
};

const webosA: JellyfinSession = {
  Id: "a",
  Client: "Jellyfin for WebOS",
  SupportsRemoteControl: true,
};

// --- pickEpisode ---
{
  const r = pickEpisode(bear, {});
  assert(r.episode?.Id === "ep-1-3" && r.reason === "unplayed", "1: next unplayed after furthest");
}
{
  const r = pickEpisode(bear, { episode: 2 });
  assert(r.episode?.Id === "ep-1-2" && r.reason === "requested", "2: episode without season");
}
{
  const r = pickEpisode(bear, { season: 2, episode: 1 });
  assert(r.episode?.Id === "ep-2-1" && r.reason === "requested", "3: explicit S2E1");
}
{
  const r = pickEpisode(bear, { season: 3 });
  assert(r.episode === null && r.reason === "season-not-found", "4: season missing");
}
{
  const r = pickEpisode(bear, { season: 1, episode: 9 });
  assert(r.episode === null && r.reason === "episode-not-found", "5: episode missing");
}
{
  const r = pickEpisode([ep(1, 1, true), ep(1, 2, true)], {});
  assert(r.episode === null && r.reason === "all-played", "6: all played");
}
{
  const r = pickEpisode([], {});
  assert(r.episode === null && r.reason === "no-episodes", "7: empty");
}
{
  const r = pickEpisode([ep(3, 15), ep(8, 10, true), ep(8, 11)], {});
  assert(r.episode?.Id === "ep-8-11" && r.reason === "unplayed", "8: after furthest across seasons");
}
{
  const r = pickEpisode([ep(1, 1), ep(1, 2, true)], {});
  assert(r.episode === null && r.reason === "caught-up", "9: earlier hole after furthest");
}
{
  const r = pickEpisode([ep(0, 1), ep(1, 1, true), ep(1, 2)], {});
  assert(r.episode?.Id === "ep-1-2" && r.reason === "unplayed", "10: prefer real seasons over specials");
}
{
  const r = pickEpisode(
    [{ Id: "x", ParentIndexNumber: 1, IndexNumber: 1 }],
    {},
  );
  assert(r.episode?.Id === "x" && r.reason === "unplayed", "11: missing UserData is unplayed");
}

// --- episodeAvailability ---
assert(episodeAvailability(bear) === "(seasons 1-2)", "12: multi-season availability");
assert(
  episodeAvailability([ep(1, 1), ep(1, 2)]) === "(S1 has episodes 1-2)",
  "13: single-season availability",
);
assert(episodeAvailability([]) === "", "14: empty availability");

// --- session match ---
{
  const matched = matchWebosControllableSessions([
    { Id: "a", Client: "Jellyfin for WebOS", SupportsRemoteControl: true },
    { Id: "b", Client: "Jellyfin Web", SupportsRemoteControl: true },
    { Id: "c", Client: "Jellyfin for WebOS", SupportsRemoteControl: false },
    {
      Id: "d",
      Client: "Jellyfin for WebOS Homebase",
      SupportsRemoteControl: true,
    },
  ]);
  assert(matched.length === 1 && matched[0].Id === "a", "15: unique webOS only");
}

async function main() {
  {
    const waited = await waitForUniqueTvSession(cfg, {
      list: async () => [webosA],
      sleep: async () => {},
    });
    assert(
      "session" in waited && waited.session.Id === "a",
      "16: wait finds unique session",
    );
  }
  {
    const waited = await waitForUniqueTvSession(cfg, {
      list: async () => [
        webosA,
        { Id: "b", Client: "Jellyfin for WebOS", SupportsRemoteControl: true },
      ],
      sleep: async () => {},
    });
    assert("reason" in waited && waited.reason === "multiple", "17: multiple sessions");
  }
  {
    const waited = await waitForUniqueTvSession(cfg, {
      list: async () => [],
      maxMs: 5,
      intervalMs: 1,
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    });
    assert("reason" in waited && waited.reason === "none", "18: none after timeout");
  }

  // --- T-150 find shaping ---
  const dune156: JellyfinItem = {
    Id: "m1",
    Name: "Dune",
    Type: "Movie",
    ProductionYear: 2021,
    RunTimeTicks: 93_600_000_000,
    UserData: { Played: true },
  };
  {
    const row = publicRow(dune156);
    assert(
      JSON.stringify(row) ===
        JSON.stringify({
          kind: "movie",
          id: "m1",
          title: "Dune",
          year: 2021,
          runtime_minutes: 156,
          played: true,
        }),
      "F1: movie publicRow",
    );
  }
  {
    const row = publicRow({
      Id: "s1",
      Name: "Dune: Prophecy",
      Type: "Series",
      ProductionYear: 2024,
      UserData: { Played: false },
    });
    assert(row !== null && row.kind === "series", "F2: series kind");
    assert(row !== null && !("played" in row), "F2: no played");
    assert(row !== null && !("total_runtime_minutes" in row), "F2: no total_runtime_minutes");
  }
  {
    assert(publicRow({ Id: "e1", Name: "Ep", Type: "Episode" }) === null, "F3: episode null");
  }
  {
    const shaped = shapeFindPayload([dune156], false, null, 120);
    assert(shaped.count === 0, "F4: ceiling-only drops over-limit");
  }
  {
    const shaped = shapeFindPayload([dune156], false, "dune", 120);
    assert(shaped.count === 1, "F5: title+ceiling keeps row");
    assert(shaped.results[0]?.within_max_minutes === false, "F5: within_max_minutes false");
    assert(shaped.notes.length === 3, "F5: three notes");
  }
  {
    const ordered = sortExactFirst(
      [{ Name: "Dune Part Two" }, { Name: "Dune" }],
      "dune",
    );
    assert(ordered[0]?.Name === "Dune", "F6: exact title first");
  }

  // --- T-150 continue watching ---
  {
    const shaped = shapeContinueWatching(
      [
        {
          Id: "m1",
          Name: "Dune",
          Type: "Movie",
          UserData: {
            PlaybackPositionTicks: 5000,
            LastPlayedDate: "2026-10-01T20:00:00Z",
          },
        },
      ],
      [
        {
          Id: "e1",
          Name: "System",
          Type: "Episode",
          SeriesId: "s1",
          SeriesName: "The Bear",
          ParentIndexNumber: 2,
          IndexNumber: 1,
          UserData: { LastPlayedDate: "2026-10-05T20:00:00Z" },
        },
      ],
    );
    const first = shaped.results[0];
    const second = shaped.results[1];
    assert(first?.kind === "series", "C1: series first by last played");
    assert(
      first !== undefined && "next_episode" in first && first.next_episode.label === "S2E1",
      "C1: S2E1 label",
    );
    assert(
      second?.kind === "movie" && second.resume_position_ticks === 5000,
      "C1: movie resume ticks",
    );
    assert(shaped.empty === false, "C1: not empty");
  }
  {
    const shaped = shapeContinueWatching([], []);
    assert(shaped.empty === true, "C2: empty");
    assert(shaped.notes.includes("nothing part-watched"), "C2: empty note");
  }

  // --- T-150 stats ---
  {
    const w = resolveStatsWindow({}, "Europe/Amsterdam", new Date("2026-10-17T10:00:00Z"));
    assert(!isDomainError(w), "S1: window resolves");
    if (!isDomainError(w)) {
      const shaped = shapeStats([], false, w);
      assert(shaped.window.since === "2026-01-01", "S1: since");
      assert(shaped.window.until === "2027-01-01", "S1: until");
      assert(shaped.window.timezone === "Europe/Amsterdam", "S1: timezone");
    }
  }
  {
    const err = resolveStatsWindow(
      { period: "custom", since: "2026-05-02", until: "2026-05-01" },
      "Europe/Amsterdam",
    );
    assert(isDomainError(err) && err.message === "since must not be after until", "S2: since after until");
  }
  {
    const err = resolveStatsWindow({ period: "weekly" }, "UTC");
    assert(
      isDomainError(err) && err.message.startsWith("period must be one of"),
      "S3: invalid period",
    );
  }
  {
    const w = resolveStatsWindow({}, "Europe/Amsterdam", new Date("2026-10-17T10:00:00Z"));
    assert(!isDomainError(w), "S4: window for shape");
    if (!isDomainError(w)) {
      const shaped = shapeStats(
        [
          {
            Id: "a",
            Name: "A",
            Type: "Movie",
            UserData: { LastPlayedDate: "2025-12-31T23:30:00Z" },
          },
          {
            Id: "a",
            Name: "A",
            Type: "Movie",
            UserData: { LastPlayedDate: "2026-03-01T10:00:00Z" },
          },
          { Id: "b", Name: "B", Type: "Movie" },
          {
            Id: "s",
            Name: "S",
            Type: "Series",
            UserData: { LastPlayedDate: "2026-03-01T10:00:00Z" },
          },
        ],
        false,
        w,
      );
      assert(shaped.counts.films_last_played_in_window === 1, "S4: count one (first id a)");
      assert(shaped.watch_history === false, "S4: watch_history false");
    }
  }

  // --- T-150 date normalize ---
  assert(
    normalizeJellyfinDate("2026-10-06T19:22:11.1234567Z") === "2026-10-06T19:22:11Z",
    "D1: truncate fractional",
  );
  assert(
    normalizeJellyfinDate("2026-10-06T19:22:11") === "2026-10-06T19:22:11Z",
    "D2: bare assumes Z",
  );
  assert(normalizeJellyfinDate("bad") === null, "D3: bad null");

  console.log("OK: media selftest");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
