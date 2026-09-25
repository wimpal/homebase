import { prisma } from "@/core/db";
import { getLocalScheduleParts } from "@/domain/automations/schedule";
import {
  applyMinutesBefore,
  getLocalSunsetHhMm,
  parseLatLon,
} from "@/domain/automations/sunset";
import { AUTOMATION_TIMEZONE_V1, LAST_RUN_RESULT_MAX } from "@/domain/automations/types";
import type { AdjustSunsetSummary, SunsetLookupFn } from "@/domain/automations/sunset-adjust";

export type AdjustCinemaSunsetOptions = {
  now?: Date;
  lookupSunset?: SunsetLookupFn;
};

function truncateAdjustResult(message: string): string {
  if (message.length <= LAST_RUN_RESULT_MAX) return message;
  return `${message.slice(0, LAST_RUN_RESULT_MAX - 1)}…`;
}

/**
 * Daily adjuster (ADR-024): rewrite Cinema cutoffHhMm from local sunset
 * minus minutesBeforeSunset. Does not call devices or touch run locks.
 */
export async function adjustSunsetLinkedCinemaCutoff(
  options: AdjustCinemaSunsetOptions = {},
): Promise<AdjustSunsetSummary> {
  const now = options.now ?? new Date();
  const lookupSunset = options.lookupSunset ?? getLocalSunsetHhMm;

  const rows = await prisma.protocolCinemaSettings.findMany({
    where: { sunsetLinkEnabled: true },
    select: {
      id: true,
      householdId: true,
      cutoffHhMm: true,
      minutesBeforeSunset: true,
      sunsetLastAdjustAt: true,
      sunsetLastAdjustResult: true,
      household: {
        select: { latitude: true, longitude: true, timezone: true },
      },
    },
  });

  const summary: AdjustSunsetSummary = {
    considered: rows.length,
    rewritten: 0,
    skipped: 0,
    failed: 0,
  };

  for (const row of rows) {
    const timezone = row.household.timezone || AUTOMATION_TIMEZONE_V1;
    const { dateKey } = getLocalScheduleParts(now, timezone);
    const offset = row.minutesBeforeSunset;

    if (
      offset === null ||
      offset === undefined ||
      !Number.isInteger(offset) ||
      offset < 0 ||
      offset > 180
    ) {
      await recordFailure(row.id, row.householdId, offset, "invalid_offset");
      summary.failed += 1;
      continue;
    }

    if (
      row.sunsetLastAdjustAt &&
      row.sunsetLastAdjustResult?.startsWith("ok:")
    ) {
      const lastParts = getLocalScheduleParts(row.sunsetLastAdjustAt, timezone);
      const expectedOk = `ok:${row.cutoffHhMm}`;
      if (
        lastParts.dateKey === dateKey &&
        row.sunsetLastAdjustResult === expectedOk
      ) {
        summary.skipped += 1;
        continue;
      }
    }

    const coords = parseLatLon(
      row.household.latitude,
      row.household.longitude,
    );
    if (!coords) {
      await recordFailure(row.id, row.householdId, offset, "no_coords");
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
      await recordFailure(row.id, row.householdId, offset, sunset.reason);
      summary.failed += 1;
      continue;
    }

    let newTime: string;
    try {
      newTime = applyMinutesBefore(sunset.sunsetHhMm, offset);
    } catch {
      await recordFailure(row.id, row.householdId, offset, "offset_error");
      summary.failed += 1;
      continue;
    }

    const result = truncateAdjustResult(`ok:${newTime}`);
    const updated = await prisma.protocolCinemaSettings.updateMany({
      where: {
        id: row.id,
        householdId: row.householdId,
        sunsetLinkEnabled: true,
        minutesBeforeSunset: offset,
      },
      data: {
        cutoffHhMm: newTime,
        sunsetLastAdjustAt: now,
        sunsetLastAdjustResult: result,
      },
    });

    if (updated.count === 0) {
      summary.skipped += 1;
      continue;
    }

    if (newTime === row.cutoffHhMm) {
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
  await prisma.protocolCinemaSettings.updateMany({
    where: {
      id,
      householdId,
      sunsetLinkEnabled: true,
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
