import { isDomainError } from "@/domain/error";
import { getJellyfinConfig, jellyfinRequest } from "./client";

export type JellyfinStatus = "connected" | "not_configured" | "unreachable";

/** Settings status line. Short timeout so a down Jellyfin never stalls the page. */
export async function getJellyfinStatus(): Promise<JellyfinStatus> {
  const config = getJellyfinConfig();
  if (!config) return "not_configured";
  const res = await jellyfinRequest(config, "GET", "System/Info", {}, 3_000);
  if (isDomainError(res) || res.status === 404) return "unreachable";
  return "connected";
}
