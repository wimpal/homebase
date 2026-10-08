/**
 * Read-side queries for calendar feed occurrences (T-139).
 */

import { prisma } from "@/core/db";
import type { CalendarOccurrenceDTO } from "./types";

export async function listCalendarOccurrences(
  householdId: string,
  from: Date,
  to: Date,
): Promise<CalendarOccurrenceDTO[]> {
  const rows = await prisma.calendarFeedOccurrence.findMany({
    where: {
      subscription: { householdId, enabled: true },
      startAt: { lt: to },
      OR: [{ endAt: { gte: from } }, { endAt: null, startAt: { gte: from } }],
    },
    include: { subscription: { select: { name: true, color: true } } },
    orderBy: [{ startAt: "asc" }, { title: "asc" }],
  });

  return rows.map((row) => ({
    id: row.id,
    subscriptionId: row.subscriptionId,
    feedName: row.subscription.name,
    feedColor: row.subscription.color,
    title: row.title,
    description: row.description,
    location: row.location,
    startAt: row.startAt,
    endAt: row.endAt,
    allDay: row.allDay,
  }));
}
