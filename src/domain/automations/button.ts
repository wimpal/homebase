import { ModuleId, LightAutomationTriggerKind } from "@prisma/client";
import { prisma } from "@/core/db";
import { isDomainError } from "@/domain/error";
import { verifyDirigeraConnectivity } from "@/domain/smarthome";
import { isWithinActiveWindow } from "./active-window";
import { applyAutomationAction } from "./apply";
import { getLocalScheduleParts } from "./schedule";
import {
  AUTOMATION_TIMEZONE_V1,
  BUTTON_CLICK_PATTERNS,
  SENSOR_COOLDOWN_MS,
  SENSOR_DEBOUNCE_MS,
  type ButtonClickPattern,
} from "./types";
import { truncateLastRunResult } from "./validate";

/** In-process debounce: `${deviceId}:${identity}` → last press receipt ms. */
const lastPressAt = new Map<string, number>();

export type HandleButtonPressResult = {
  rulesMatched: number;
  claimed: number;
  applied: number;
  skipped: number;
  failed: number;
};

/**
 * Atomically claim BUTTON cooldown via lastRunAt.
 * Returns true if this caller won the claim.
 */
export async function claimButtonCooldown(
  householdId: string,
  id: string,
  now: Date = new Date(),
  cooldownMs: number = SENSOR_COOLDOWN_MS,
): Promise<boolean> {
  const cutoff = new Date(now.getTime() - cooldownMs);
  const updated = await prisma.lightAutomation.updateMany({
    where: {
      id,
      householdId,
      enabled: true,
      triggerKind: LightAutomationTriggerKind.BUTTON,
      OR: [{ lastRunAt: null }, { lastRunAt: { lt: cutoff } }],
    },
    data: {
      lastRunAt: now,
      lastRunResult: truncateLastRunResult("claimed:button_cooldown"),
    },
  });
  return updated.count === 1;
}

export function clearButtonDebounceState(): void {
  lastPressAt.clear();
}

export function shouldDebounceButtonPress(
  deviceId: string,
  identity: string,
  receivedAtMs: number,
  debounceMs: number = SENSOR_DEBOUNCE_MS,
): boolean {
  const key = `${deviceId}:${identity}`;
  const prev = lastPressAt.get(key);
  if (prev != null && receivedAtMs - prev < debounceMs) {
    return true;
  }
  lastPressAt.set(key, receivedAtMs);
  return false;
}

function isButtonClickPattern(value: string): value is ButtonClickPattern {
  return (BUTTON_CLICK_PATTERNS as readonly string[]).includes(value);
}

/**
 * Handle a Dirigera remotePressEvent for BUTTON automations.
 * No boot replay — presses are discrete events.
 */
export async function handleButtonPress(input: {
  deviceId: string;
  identity: string;
  receivedAt?: Date;
}): Promise<HandleButtonPressResult> {
  const receivedAt = input.receivedAt ?? new Date();
  const summary: HandleButtonPressResult = {
    rulesMatched: 0,
    claimed: 0,
    applied: 0,
    skipped: 0,
    failed: 0,
  };

  const identity = input.identity.trim();
  if (!identity || !isButtonClickPattern(identity)) {
    return summary;
  }

  if (
    shouldDebounceButtonPress(input.deviceId, identity, receivedAt.getTime())
  ) {
    return summary;
  }

  const connectivity = await verifyDirigeraConnectivity();
  if (isDomainError(connectivity)) {
    return summary;
  }

  const rules = await prisma.lightAutomation.findMany({
    where: {
      enabled: true,
      triggerKind: LightAutomationTriggerKind.BUTTON,
      buttonDirigeraDeviceId: input.deviceId,
      buttonIdentity: identity,
    },
    include: { targets: true, household: { select: { id: true } } },
  });

  if (rules.length === 0) {
    return summary;
  }

  const householdIds = [...new Set(rules.map((r) => r.householdId))];
  const moduleOk = new Map<string, boolean>();
  for (const hid of householdIds) {
    const setting = await prisma.moduleSetting.findUnique({
      where: {
        householdId_moduleId: { householdId: hid, moduleId: ModuleId.SMART_HOME },
      },
    });
    moduleOk.set(hid, setting?.enabled !== false);
  }

  const localTime = getLocalScheduleParts(receivedAt, AUTOMATION_TIMEZONE_V1)
    .timeLocal;

  for (const rule of rules) {
    if (!moduleOk.get(rule.householdId)) {
      summary.skipped += 1;
      continue;
    }

    summary.rulesMatched += 1;

    if (
      !isWithinActiveWindow(
        localTime,
        rule.activeFromLocal,
        rule.activeUntilLocal,
      )
    ) {
      summary.skipped += 1;
      continue;
    }

    const claimed = await claimButtonCooldown(
      rule.householdId,
      rule.id,
      receivedAt,
    );
    if (!claimed) {
      summary.skipped += 1;
      continue;
    }
    summary.claimed += 1;

    const result = await applyAutomationAction(rule.householdId, rule.id, {
      updateLastRunAt: false,
    });
    if (isDomainError(result)) {
      summary.failed += 1;
      await prisma.lightAutomation.updateMany({
        where: { id: rule.id, householdId: rule.householdId },
        data: {
          lastRunResult: truncateLastRunResult(`failed:${result.message}`),
        },
      });
      continue;
    }
    summary.applied += 1;
    await prisma.lightAutomation.updateMany({
      where: { id: rule.id, householdId: rule.householdId },
      data: {
        lastRunResult: truncateLastRunResult(
          result.lastRunResult || "ok:button",
        ),
      },
    });
  }

  return summary;
}
