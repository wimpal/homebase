import { DomainError, isDomainError } from "@/domain/error";
import { launchAppNetworkDevice } from "@/domain/network";
import { getItem } from "./client";
import { assertMediaReady } from "./gate";
import { playItems, waitForUniqueTvSession } from "./sessions";

export interface MediaPlayResult {
  status: "playing" | "dry_run";
  device_id: string;
  device_name: string;
  item_id: string;
  title: string;
  kind: "movie" | "episode";
  series_name: string | null;
  woke: boolean;
}

export async function playOnTv(
  householdId: string,
  input: { deviceId: string; itemId: string; wakeIfNeeded: boolean },
): Promise<MediaPlayResult | DomainError> {
  const config = await assertMediaReady(householdId);
  if (isDomainError(config)) return config;
  const itemId = input.itemId.trim();
  if (!itemId) return DomainError.invalidInput("item_id is required.", "invalid_item_id");

  // Check the title before waking the TV.
  const item = await getItem(config, itemId);
  if (isDomainError(item)) return item;
  if (!item) return DomainError.notFound("That title is no longer in Jellyfin.", "item_not_found");
  const type = String(item.Type ?? "");
  if (type !== "Movie" && type !== "Episode") {
    return DomainError.invalidInput(
      `That Jellyfin item is a ${type || "unknown type"}, not a film or episode.`,
      "not_playable",
    );
  }

  const launched = await launchAppNetworkDevice(householdId, input.deviceId, "jellyfin", input.wakeIfNeeded);
  if (isDomainError(launched)) return launched;

  const base: Omit<MediaPlayResult, "status"> = {
    device_id: launched.id,
    device_name: launched.name,
    item_id: itemId,
    title: String(item.Name ?? ""),
    kind: type === "Movie" ? "movie" : "episode",
    series_name: type === "Episode" && item.SeriesName ? String(item.SeriesName) : null,
    woke: launched.status === "woke_and_ok",
  };
  if (launched.status === "dry_run") return { status: "dry_run", ...base };

  const waited = await waitForUniqueTvSession(config);
  if ("reason" in waited) {
    if (waited.reason === "multiple") {
      return DomainError.conflict(
        "More than one Jellyfin session is open on a TV; close the extra one and try again.",
        "multiple_tv_sessions",
      );
    }
    return DomainError.unavailable(
      "No Jellyfin session on the TV (open Jellyfin on the TV, then try again).",
      "no_tv_session",
    );
  }
  const sessionId = String(waited.session.Id ?? "").trim();
  if (!sessionId) {
    return DomainError.unavailable("The Jellyfin session on the TV has no id.", "no_tv_session");
  }
  const played = await playItems(config, sessionId, [itemId]);
  if (isDomainError(played)) return played;
  return { status: "playing", ...base };
}
