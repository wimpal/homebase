import { DomainError, isDomainError } from "@/domain/error";
import { getItem, jellyfinRequest } from "./client";
import { assertMediaReady } from "./gate";
import { isRecord } from "./util";

export interface FavouriteResult {
  item_id: string;
  title: string;
  kind: "movie" | "series" | "other";
  favourite: boolean;
}

/** Port of Mimir _favorite_flag_from_payload / _favorite_flag_from_item. */
export function favouriteFlag(body: unknown): boolean | null {
  if (!isRecord(body)) return null;
  if ("IsFavorite" in body) return Boolean(body.IsFavorite);
  const ud = body.UserData;
  if (isRecord(ud) && "IsFavorite" in ud) return Boolean(ud.IsFavorite);
  return null;
}

export async function setFavourite(
  householdId: string,
  input: { itemId: string; favourite: boolean },
): Promise<FavouriteResult | DomainError> {
  const config = await assertMediaReady(householdId);
  if (isDomainError(config)) return config;
  const itemId = input.itemId.trim();
  if (!itemId) return DomainError.invalidInput("item_id is required.", "invalid_item_id");

  const item = await getItem(config, itemId);
  if (isDomainError(item)) return item;
  if (!item) return DomainError.notFound("That title is no longer in Jellyfin.", "item_not_found");

  const res = await jellyfinRequest(
    config,
    input.favourite ? "POST" : "DELETE",
    `UserFavoriteItems/${encodeURIComponent(itemId)}`,
    { userId: config.userId },
  );
  if (isDomainError(res)) return res;
  if (res.status === 404) {
    return DomainError.notFound("That title is no longer in Jellyfin.", "item_not_found");
  }

  let flag = favouriteFlag(res.body);
  if (flag === null) {
    // Empty 2xx body: read the item back (live-proven T-130 behaviour).
    const after = await getItem(config, itemId);
    if (isDomainError(after)) return after;
    if (!after) {
      return DomainError.internal(
        "Jellyfin item missing after the favourite write.",
        "favourite_unverified",
      );
    }
    flag = favouriteFlag(after);
  }
  if (flag === null) {
    return DomainError.internal("Favourite state could not be verified.", "favourite_unverified");
  }

  const type = String(item.Type ?? "");
  return {
    item_id: itemId,
    title: String(item.Name ?? ""),
    kind: type === "Movie" ? "movie" : type === "Series" ? "series" : "other",
    favourite: flag,
  };
}
