/**
 * Hourly background sync across households (T-139). Skips households whose
 * Calendar module is disabled. Shared by the scheduler and MCP-free UI paths.
 */

import { ModuleId } from "@prisma/client";
import { prisma } from "@/core/db";
import { isModuleEnabled } from "@/core/modules/settings";
import { syncCalendarSubscription } from "./sync";

export type CalendarSyncSummary = {
  feeds: number;
  synced: number;
  failed: number;
};

export async function syncCalendarFeeds(): Promise<CalendarSyncSummary> {
  const households = await prisma.household.findMany({ select: { id: true } });
  const summary: CalendarSyncSummary = { feeds: 0, synced: 0, failed: 0 };

  for (const household of households) {
    if (!(await isModuleEnabled(household.id, ModuleId.CALENDAR))) continue;

    const subscriptions = await prisma.calendarSubscription.findMany({
      where: { householdId: household.id, enabled: true },
      select: { id: true, name: true },
    });

    for (const subscription of subscriptions) {
      summary.feeds += 1;
      const result = await syncCalendarSubscription(subscription.id);
      if (result.ok) {
        summary.synced += 1;
      } else {
        summary.failed += 1;
        console.warn(
          `[calendar] sync failed for "${subscription.name}" (${subscription.id}): ${result.error}`,
        );
      }
    }
  }

  return summary;
}
