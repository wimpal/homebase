import { ModuleId } from "@prisma/client";
import { prisma } from "@/core/db";
import { isDomainError } from "@/domain/error";
import { isWithinActiveWindow } from "./active-window";
import { applyAutomationAction } from "./apply";
import { AUTOMATION_TIMEZONE_V1 } from "./types";

export type LocalScheduleParts = {
  dateKey: string;
  timeLocal: string;
  isoWeekday: number;
};

const weekdayToIso: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

/**
 * Local calendar parts for schedule matching (CONVENTIONS: Europe/Amsterdam v1).
 */
export function getLocalScheduleParts(
  now: Date,
  timeZone: string = AUTOMATION_TIMEZONE_V1,
): LocalScheduleParts {
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });
  const parts = dtf.formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";

  const year = get("year");
  const month = get("month");
  const day = get("day");
  const hour = get("hour");
  const minute = get("minute");
  const weekday = get("weekday");
  const isoWeekday = weekdayToIso[weekday];
  if (!isoWeekday) {
    throw new Error(`Unexpected weekday part: ${weekday}`);
  }

  return {
    dateKey: `${year}-${month}-${day}`,
    timeLocal: `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`,
    isoWeekday,
  };
}

export function slotKey(dateKey: string, timeLocal: string): string {
  return `${dateKey}T${timeLocal}`;
}

/**
 * Atomically claim a schedule slot. Returns true if this caller won the claim.
 * No catch-up: caller only claims the *current* minute slot.
 */
export async function claimAutomationSlot(
  householdId: string,
  id: string,
  slot: string,
): Promise<boolean> {
  const updated = await prisma.lightAutomation.updateMany({
    where: {
      id,
      householdId,
      enabled: true,
      OR: [{ lastFiredSlot: null }, { lastFiredSlot: { not: slot } }],
    },
    data: { lastFiredSlot: slot },
  });
  return updated.count === 1;
}

export type EvaluateLightAutomationsResult = {
  matched: number;
  claimed: number;
  applied: number;
  failed: number;
};

/**
 * Evaluate enabled LightAutomations for the current local minute.
 * Missed minutes are not backfilled (deploy/restart safe).
 */
export async function evaluateLightAutomations(
  now: Date = new Date(),
): Promise<EvaluateLightAutomationsResult> {
  const result: EvaluateLightAutomationsResult = {
    matched: 0,
    claimed: 0,
    applied: 0,
    failed: 0,
  };

  const households = await prisma.household.findMany({ select: { id: true } });

  for (const household of households) {
    const moduleSetting = await prisma.moduleSetting.findUnique({
      where: {
        householdId_moduleId: {
          householdId: household.id,
          moduleId: ModuleId.SMART_HOME,
        },
      },
    });
    if (moduleSetting && !moduleSetting.enabled) continue;

    const rules = await prisma.lightAutomation.findMany({
      where: {
        householdId: household.id,
        enabled: true,
        triggerKind: "SCHEDULE",
      },
      select: {
        id: true,
        timeLocal: true,
        daysOfWeek: true,
        timezone: true,
        activeFromLocal: true,
        activeUntilLocal: true,
      },
    });

    for (const rule of rules) {
      if (!rule.timeLocal) continue;
      const timeZone = rule.timezone || AUTOMATION_TIMEZONE_V1;
      const local = getLocalScheduleParts(now, timeZone);
      if (rule.timeLocal !== local.timeLocal) continue;
      if (!rule.daysOfWeek.includes(local.isoWeekday)) continue;
      if (
        !isWithinActiveWindow(
          local.timeLocal,
          rule.activeFromLocal,
          rule.activeUntilLocal,
        )
      ) {
        continue;
      }

      result.matched += 1;
      const slot = slotKey(local.dateKey, local.timeLocal);
      const claimed = await claimAutomationSlot(household.id, rule.id, slot);
      if (!claimed) continue;

      result.claimed += 1;
      const applied = await applyAutomationAction(household.id, rule.id);
      if (isDomainError(applied) || applied.failed === applied.attempted) {
        result.failed += 1;
      } else {
        result.applied += 1;
      }
    }
  }

  return result;
}
