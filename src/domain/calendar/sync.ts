/**
 * Feed sync (T-139 / ADR-029): fetch → parse → replace occurrences for the
 * window in one transaction. On failure the previous occurrences stay and the
 * feed row records a calm error.
 */

import { addDays, subDays } from "date-fns";
import { prisma } from "@/core/db";
import {
  FEED_FETCH_TIMEOUT_MS,
  normalizeFeedUrl,
  parseFeedOccurrences,
} from "./ics";
import type { SyncFeedResult } from "./types";

export const SYNC_WINDOW_PAST_DAYS = 60;
export const SYNC_WINDOW_FUTURE_DAYS = 365;

function fetchErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      return "timed out fetching the feed";
    }
    if (err.message === "fetch failed") {
      return "could not reach the feed";
    }
    return err.message;
  }
  return "could not fetch the feed";
}

async function recordSyncError(
  subscriptionId: string,
  error: string,
): Promise<SyncFeedResult> {
  try {
    await prisma.calendarSubscription.update({
      where: { id: subscriptionId },
      data: { lastSyncError: error },
    });
  } catch {
    // Feed was removed while syncing — nothing to stamp.
  }
  return { ok: false, error };
}

export async function syncCalendarSubscription(
  subscriptionId: string,
  options?: { now?: Date },
): Promise<SyncFeedResult> {
  const subscription = await prisma.calendarSubscription.findUnique({
    where: { id: subscriptionId },
  });
  if (!subscription) {
    return { ok: false, error: "Subscription not found." };
  }
  if (!subscription.enabled) {
    return { ok: false, error: "Subscription is disabled." };
  }

  const url = normalizeFeedUrl(subscription.url);
  if (!url) {
    return recordSyncError(subscriptionId, "Invalid feed URL.");
  }

  let body: string;
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(FEED_FETCH_TIMEOUT_MS),
      headers: { "user-agent": "Homebase-Calendar/1.0" },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    body = await response.text();
    if (!body.trim()) {
      throw new Error("empty feed body");
    }
  } catch (err) {
    return recordSyncError(subscriptionId, fetchErrorMessage(err));
  }

  const now = options?.now ?? new Date();
  let occurrences;
  try {
    occurrences = parseFeedOccurrences(body, {
      from: subDays(now, SYNC_WINDOW_PAST_DAYS),
      to: addDays(now, SYNC_WINDOW_FUTURE_DAYS),
    });
  } catch (err) {
    return recordSyncError(
      subscriptionId,
      err instanceof Error ? err.message : "invalid feed",
    );
  }

  const operations = [
    prisma.calendarFeedOccurrence.deleteMany({ where: { subscriptionId } }),
    ...(occurrences.length > 0
      ? [
          prisma.calendarFeedOccurrence.createMany({
            data: occurrences.map((occurrence) => ({
              subscriptionId,
              ...occurrence,
            })),
          }),
        ]
      : []),
    prisma.calendarSubscription.update({
      where: { id: subscriptionId },
      data: { lastSyncedAt: new Date(), lastSyncError: null },
    }),
  ];

  try {
    await prisma.$transaction(operations);
  } catch {
    return recordSyncError(subscriptionId, "could not save feed occurrences");
  }

  return { ok: true, count: occurrences.length };
}
