/**
 * Self-test for media episode pick + webOS session matching (no live Jellyfin).
 * Usage: npm run media:selftest
 */
import {
  episodeAvailability,
  pickEpisode,
} from "../src/domain/media/episodes";
import {
  matchWebosControllableSessions,
  waitForUniqueTvSession,
} from "../src/domain/media/sessions";
import type { JellyfinItem, JellyfinSession } from "../src/domain/media/types";

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

  console.log("OK: media selftest");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
