import { getLocalScheduleParts } from "@/domain/automations/schedule";
import { AUTOMATION_TIMEZONE_V1 } from "@/domain/automations/types";

const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidCutoffHhMm(value: string): boolean {
  return HHMM_RE.test(value.trim());
}

/**
 * Compare now vs stored cutoff HH:MM in household timezone (ADR-024 /
 * T-115: Homebase owns the clock via Household.timezone).
 */
export function isPastCutoff(
  now: Date,
  cutoffHhMm: string,
  timezone: string = AUTOMATION_TIMEZONE_V1,
): boolean {
  const { timeLocal } = getLocalScheduleParts(now, timezone || AUTOMATION_TIMEZONE_V1);
  return timeLocal >= cutoffHhMm.trim();
}

export function localTimeHhMm(
  now: Date,
  timezone: string = AUTOMATION_TIMEZONE_V1,
): string {
  return getLocalScheduleParts(now, timezone || AUTOMATION_TIMEZONE_V1).timeLocal;
}
