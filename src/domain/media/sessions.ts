import { DomainError, isDomainError } from "@/domain/error";
import { jellyfinRequest, jellyfinUnreachable, type JellyfinConfig } from "./client";
import type { JellyfinSession } from "./types";
import { isRecord } from "./util";

export const SESSION_POLL_INTERVAL_MS = 1_500;
export const SESSION_POLL_MAX_MS = 45_000;
const WEBOS_CLIENT_MARKER = "WebOS";
const OWN_CLIENT_MARKERS = ["Homebase", "Mimir"];

export async function listSessions(
  config: JellyfinConfig,
): Promise<JellyfinSession[] | DomainError> {
  const res = await jellyfinRequest(config, "GET", "Sessions");
  if (isDomainError(res)) return res;
  if (!Array.isArray(res.body)) return jellyfinUnreachable("bad JSON");
  return res.body.filter(isRecord) as JellyfinSession[];
}

/** Spike-proven match (T-116): remote-controllable Jellyfin for webOS, never our own client. */
export function matchWebosControllableSessions(sessions: JellyfinSession[]): JellyfinSession[] {
  return sessions.filter((session) => {
    if (!session.SupportsRemoteControl) return false;
    const client = String(session.Client ?? "");
    if (!client.includes(WEBOS_CLIENT_MARKER)) return false;
    return !OWN_CLIENT_MARKERS.some((marker) => client.includes(marker));
  });
}

export type SessionWaitResult =
  | { session: JellyfinSession }
  | { reason: "none" | "multiple" };

export interface SessionWaitOptions {
  maxMs?: number;
  intervalMs?: number;
  list?: () => Promise<JellyfinSession[] | DomainError>;
  sleep?: (ms: number) => Promise<void>;
}

export async function waitForUniqueTvSession(
  config: JellyfinConfig,
  options: SessionWaitOptions = {},
): Promise<SessionWaitResult> {
  const maxMs = options.maxMs ?? SESSION_POLL_MAX_MS;
  const intervalMs = options.intervalMs ?? SESSION_POLL_INTERVAL_MS;
  const list = options.list ?? (() => listSessions(config));
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    const listed = await list();
    const matched = matchWebosControllableSessions(isDomainError(listed) ? [] : listed);
    if (matched.length === 1) return { session: matched[0] };
    if (matched.length > 1) return { reason: "multiple" };
    await sleep(intervalMs);
  }
  return { reason: "none" };
}

export async function playItems(
  config: JellyfinConfig,
  sessionId: string,
  itemIds: string[],
): Promise<true | DomainError> {
  const res = await jellyfinRequest(
    config,
    "POST",
    `Sessions/${encodeURIComponent(sessionId)}/Playing`,
    { playCommand: "PlayNow", itemIds: itemIds.join(",") },
  );
  if (isDomainError(res)) return res;
  if (res.status === 404) {
    return DomainError.unavailable(
      "The Jellyfin session on the TV went away before playback started.",
      "no_tv_session",
    );
  }
  return true;
}
