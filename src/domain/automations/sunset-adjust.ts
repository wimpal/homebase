import { prisma } from "@/core/db";
import { getLocalScheduleParts } from "./schedule";
import {
  applyMinutesBefore,
  getLocalSunsetHhMm,
  parseLatLon,
} from "./sunset";
import { AUTOMATION_TIMEZONE_V1, LAST_RUN_RESULT_MAX } from "./types";

export type AdjustSunsetSummary = {
  considered: number;
  rewritten: number;
  skipped: number;
  failed: number;
};

export type SunsetLookupFn = typeof getLocalSunsetHhMm;

export type AdjustSunsetOptions = {
  now?: Date;
  /** Injectable for smoke tests. */
  lookupSunset?: SunsetLookupFn;
};

function truncateAdjustResult(message: string): string {
  if (message.length <= LAST_RUN_RESULT_MAX) return message;
  return `${message.slice(0, LAST_RUN_RESULT_MAX - 1)}…`;
}

/**
 * Daily adjuster (T-087 / ADR-014): rewrite stored timeLocal from local sunset
 * minus minutesBeforeSunset. Never applies lights or touches lastFiredSlot /
 * lastRunAt / lastRunResult.
 */
export async function adjustSunsetLinkedAutomations(
  options: AdjustSunsetOptions = {},
): Promise<AdjustSunsetSummary> {
  const now = options.now ?? new Date();
  const lookupSunset = options.lookupSunset ?? getLocalSunsetHhMm;

  const rules = await prisma.lightAutomation.findMany({
    where: {
      enabled: true,
      sunsetLinkEnabled: true,
      triggerKind: "SCHEDULE",
    },
    select: {
      id: true,
      householdId: true,
      timeLocal: true,
      timezone: true,
      minutesBeforeSunset: true,
      sunsetLastAdjustAt: true,
      sunsetLastAdjustResult: true,
      household: {
        select: { latitude: true, longitude: true },
      },
    },
  });

  const summary: AdjustSunsetSummary = {
    considered: rules.length,
    rewritten: 0,
    skipped: 0,
    failed: 0,
  };

  for (const rule of rules) {
    const timezone = rule.timezone || AUTOMATION_TIMEZONE_V1;
    const { dateKey } = getLocalScheduleParts(now, timezone);
    const offset = rule.minutesBeforeSunset;

    if (
      offset === null ||
      offset === undefined ||
      !Number.isInteger(offset) ||
      offset < 0 ||
      offset > 180
    ) {
      await recordFailure(rule.id, rule.householdId, offset, "invalid_offset");
      summary.failed += 1;
      continue;
    }

    // Idempotent skip: already adjusted today for this offset → rewritten time.
    if (
      rule.sunsetLastAdjustAt &&
      rule.sunsetLastAdjustResult?.startsWith("ok:")
    ) {
      const lastParts = getLocalScheduleParts(rule.sunsetLastAdjustAt, timezone);
      const expectedOk = `ok:${rule.timeLocal ?? ""}`;
      if (
        lastParts.dateKey === dateKey &&
        rule.sunsetLastAdjustResult === expectedOk
      ) {
        summary.skipped += 1;
        continue;
      }
    }

    const coords = parseLatLon(
      rule.household.latitude,
      rule.household.longitude,
    );
    if (!coords) {
      await recordFailure(rule.id, rule.householdId, offset, "no_coords");
      summary.failed += 1;
      continue;
    }

    const sunset = lookupSunset({
      lat: coords.lat,
      lon: coords.lon,
      when: now,
      timezone,
    });
    if (!sunset.ok) {
      await recordFailure(rule.id, rule.householdId, offset, sunset.reason);
      summary.failed += 1;
      continue;
    }

    let newTime: string;
    try {
      newTime = applyMinutesBefore(sunset.sunsetHhMm, offset);
    } catch {
      await recordFailure(rule.id, rule.householdId, offset, "offset_error");
      summary.failed += 1;
      continue;
    }

    const result = truncateAdjustResult(`ok:${newTime}`);
    const updated = await prisma.lightAutomation.updateMany({
      where: {
        id: rule.id,
        householdId: rule.householdId,
        enabled: true,
        sunsetLinkEnabled: true,
        triggerKind: "SCHEDULE",
        minutesBeforeSunset: offset,
      },
      data: {
        timeLocal: newTime,
        sunsetLastAdjustAt: now,
        sunsetLastAdjustResult: result,
      },
    });

    if (updated.count === 0) {
      // Concurrent disable/edit — do not count as failure on the rule.
      summary.skipped += 1;
      continue;
    }

    if (newTime === rule.timeLocal) {
      summary.skipped += 1;
    } else {
      summary.rewritten += 1;
    }
  }

  return summary;
}

async function recordFailure(
  id: string,
  householdId: string,
  minutesBeforeSunset: number | null | undefined,
  reason: string,
): Promise<void> {
  await prisma.lightAutomation.updateMany({
    where: {
      id,
      householdId,
      sunsetLinkEnabled: true,
      triggerKind: "SCHEDULE",
      ...(minutesBeforeSunset === null || minutesBeforeSunset === undefined
        ? {}
        : { minutesBeforeSunset }),
    },
    data: {
      sunsetLastAdjustAt: new Date(),
      sunsetLastAdjustResult: truncateAdjustResult(`failed:${reason}`),
    },
  });
}
