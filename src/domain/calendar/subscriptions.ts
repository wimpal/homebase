/**
 * Calendar subscription CRUD (T-139 / ADR-029).
 * Occurrences are replaced per sync and dropped when a feed is
 * disabled or removed.
 */

import { prisma } from "@/core/db";
import { DomainError } from "@/domain/error";
import { normalizeFeedUrl } from "./ics";
import {
  CALENDAR_FEED_NAME_MAX,
  CALENDAR_FEED_URL_MAX,
  isCalendarFeedColor,
  type CalendarFeedColor,
  type CalendarSubscriptionRow,
} from "./types";

export async function listCalendarSubscriptions(
  householdId: string,
): Promise<CalendarSubscriptionRow[]> {
  return prisma.calendarSubscription.findMany({
    where: { householdId },
    orderBy: { createdAt: "asc" },
  });
}

export type CreateCalendarSubscriptionInput = {
  name: string;
  url: string;
  color: string;
};

export async function createCalendarSubscription(
  householdId: string,
  input: CreateCalendarSubscriptionInput,
): Promise<CalendarSubscriptionRow | DomainError> {
  const name = input.name.trim();
  if (!name) {
    return DomainError.invalidInput("A feed name is required.", "feed_name_required");
  }
  if (name.length > CALENDAR_FEED_NAME_MAX) {
    return DomainError.invalidInput(
      `Feed name must be at most ${CALENDAR_FEED_NAME_MAX} characters.`,
      "feed_name_too_long",
    );
  }
  if (input.url.length > CALENDAR_FEED_URL_MAX) {
    return DomainError.invalidInput("Feed URL is too long.", "feed_url_too_long");
  }
  const url = normalizeFeedUrl(input.url);
  if (!url) {
    return DomainError.invalidInput(
      "Enter an http(s) or webcal address of an ICS feed.",
      "feed_url_invalid",
    );
  }
  if (!isCalendarFeedColor(input.color)) {
    return DomainError.invalidInput("Pick a valid feed colour.", "feed_color_invalid");
  }

  return prisma.calendarSubscription.create({
    data: { householdId, name, url, color: input.color },
  });
}

export type UpdateCalendarSubscriptionInput = {
  name?: string;
  color?: string;
};

export async function updateCalendarSubscription(
  householdId: string,
  id: string,
  input: UpdateCalendarSubscriptionInput,
): Promise<CalendarSubscriptionRow | DomainError> {
  const existing = await prisma.calendarSubscription.findFirst({
    where: { id, householdId },
  });
  if (!existing) {
    return DomainError.notFound("Calendar subscription not found.", "feed_not_found");
  }

  const data: { name?: string; color?: CalendarFeedColor } = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) {
      return DomainError.invalidInput("A feed name is required.", "feed_name_required");
    }
    if (name.length > CALENDAR_FEED_NAME_MAX) {
      return DomainError.invalidInput(
        `Feed name must be at most ${CALENDAR_FEED_NAME_MAX} characters.`,
        "feed_name_too_long",
      );
    }
    data.name = name;
  }
  if (input.color !== undefined) {
    if (!isCalendarFeedColor(input.color)) {
      return DomainError.invalidInput("Pick a valid feed colour.", "feed_color_invalid");
    }
    data.color = input.color;
  }

  return prisma.calendarSubscription.update({ where: { id }, data });
}

/** Disabling drops that feed's occurrences immediately (acceptance 6). */
export async function setCalendarSubscriptionEnabled(
  householdId: string,
  id: string,
  enabled: boolean,
): Promise<DomainError | null> {
  const subscription = await prisma.calendarSubscription.findFirst({
    where: { id, householdId },
    select: { id: true },
  });
  if (!subscription) {
    return DomainError.notFound("Calendar subscription not found.", "feed_not_found");
  }

  if (!enabled) {
    await prisma.$transaction([
      prisma.calendarFeedOccurrence.deleteMany({ where: { subscriptionId: id } }),
      prisma.calendarSubscription.update({
        where: { id },
        data: { enabled: false, lastSyncError: null },
      }),
    ]);
  } else {
    await prisma.calendarSubscription.update({
      where: { id },
      data: { enabled: true },
    });
  }
  return null;
}

/** Removing cascades the feed's occurrences (acceptance 6). */
export async function removeCalendarSubscription(
  householdId: string,
  id: string,
): Promise<DomainError | null> {
  const result = await prisma.calendarSubscription.deleteMany({
    where: { id, householdId },
  });
  if (result.count === 0) {
    return DomainError.notFound("Calendar subscription not found.", "feed_not_found");
  }
  return null;
}
