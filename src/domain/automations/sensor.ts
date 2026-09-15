import { ModuleId, LightAutomationTriggerKind } from "@prisma/client";
import { prisma } from "@/core/db";
import { isDomainError } from "@/domain/error";
import {
  listDirigeraLightOnStates,
  verifyDirigeraConnectivity,
} from "@/domain/smarthome";
import { applyAutomationAction } from "./apply";
import {
  SENSOR_COOLDOWN_MS,
  SENSOR_DEBOUNCE_MS,
  type SensorEdgePolarity,
} from "./types";
import { truncateLastRunResult } from "./validate";

/** In-process debounce: `${sensorId}:${polarity}` → last edge receipt ms. */
const lastEdgeAt = new Map<string, number>();

/**
 * Atomically claim sensor cooldown via lastRunAt.
 * Returns true if this caller won the claim.
 */
export async function claimSensorCooldown(
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
      triggerKind: LightAutomationTriggerKind.SENSOR_EDGE,
      OR: [{ lastRunAt: null }, { lastRunAt: { lt: cutoff } }],
    },
    data: {
      lastRunAt: now,
      lastRunResult: truncateLastRunResult("claimed:sensor_cooldown"),
    },
  });
  return updated.count === 1;
}

export function clearSensorDebounceState(): void {
  lastEdgeAt.clear();
}

export function shouldDebounceSensorEdge(
  sensorId: string,
  polarity: SensorEdgePolarity,
  receivedAtMs: number,
  debounceMs: number = SENSOR_DEBOUNCE_MS,
): boolean {
  const key = `${sensorId}:${polarity}`;
  const prev = lastEdgeAt.get(key);
  if (prev != null && receivedAtMs - prev < debounceMs) {
    return true;
  }
  lastEdgeAt.set(key, receivedAtMs);
  return false;
}

/** @deprecated use shouldDebounceSensorEdge */
export function shouldDebounceRisingEdge(
  sensorId: string,
  receivedAtMs: number,
  debounceMs: number = SENSOR_DEBOUNCE_MS,
): boolean {
  return shouldDebounceSensorEdge(sensorId, "rising", receivedAtMs, debounceMs);
}

function collectEligibleTargets(
  targetIds: string[],
  onById: Map<string, boolean | null>,
  wantOn: boolean,
): string[] {
  const out: string[] = [];
  for (const id of targetIds) {
    const isOn = onById.get(id);
    // Unknown / missing isOn → skip.
    if (typeof isOn !== "boolean") continue;
    if (wantOn && isOn === false) out.push(id);
    if (!wantOn && isOn === true) out.push(id);
  }
  return out;
}

/** Toggle: every target with a known boolean isOn (on or off). */
function collectToggleEligibleTargets(
  targetIds: string[],
  onById: Map<string, boolean | null>,
): string[] {
  const out: string[] = [];
  for (const id of targetIds) {
    const isOn = onById.get(id);
    if (typeof isOn !== "boolean") continue;
    out.push(id);
  }
  return out;
}

export type HandleSensorEdgeResult = {
  rulesMatched: number;
  claimed: number;
  applied: number;
  skipped: number;
  failed: number;
};

/** @deprecated alias */
export type HandleSensorRisingEdgeResult = HandleSensorEdgeResult;

/**
 * Handle a sensor edge (local receipt time). Hub-down → no claim.
 * Eligible-light check happens before cooldown claim.
 */
export async function handleSensorEdge(input: {
  sensorId: string;
  attribute: string;
  polarity: SensorEdgePolarity;
  receivedAt: Date;
}): Promise<HandleSensorEdgeResult> {
  const result: HandleSensorEdgeResult = {
    rulesMatched: 0,
    claimed: 0,
    applied: 0,
    skipped: 0,
    failed: 0,
  };

  const connectivity = await verifyDirigeraConnectivity();
  if (isDomainError(connectivity)) {
    return result;
  }

  if (
    shouldDebounceSensorEdge(
      input.sensorId,
      input.polarity,
      input.receivedAt.getTime(),
    )
  ) {
    return result;
  }

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
        triggerKind: LightAutomationTriggerKind.SENSOR_EDGE,
        sensorDirigeraDeviceId: input.sensorId,
        sensorEdgeAttribute: input.attribute,
        OR: [
          { sensorEdgePolarity: input.polarity },
          // Legacy rows / null → rising only
          ...(input.polarity === "rising"
            ? [{ sensorEdgePolarity: null as string | null }]
            : []),
        ],
      },
      select: {
        id: true,
        on: true,
        toggle: true,
        targets: { select: { dirigeraDeviceId: true } },
      },
    });

    for (const rule of rules) {
      // Toggle is rising-only (validate enforces on write; skip malformed rows).
      if (rule.toggle && input.polarity !== "rising") {
        continue;
      }

      result.rulesMatched += 1;
      const targetIds = rule.targets.map((t) => t.dirigeraDeviceId);
      const wantOn = rule.on;
      const isToggle = rule.toggle === true;

      const onStates = await listDirigeraLightOnStates();
      if (isDomainError(onStates)) {
        result.failed += 1;
        continue;
      }

      const eligible = isToggle
        ? collectToggleEligibleTargets(targetIds, onStates)
        : collectEligibleTargets(targetIds, onStates, wantOn);
      if (eligible.length === 0) {
        result.skipped += 1;
        await prisma.lightAutomation.updateMany({
          where: { id: rule.id, householdId: household.id },
          data: {
            lastRunResult: truncateLastRunResult(
              isToggle
                ? "skipped:unknown_isOn"
                : wantOn
                  ? "skipped:already_on"
                  : "skipped:already_off",
            ),
          },
        });
        continue;
      }

      const claimed = await claimSensorCooldown(
        household.id,
        rule.id,
        input.receivedAt,
      );
      if (!claimed) continue;
      result.claimed += 1;

      const onStates2 = await listDirigeraLightOnStates();
      if (isDomainError(onStates2)) {
        result.failed += 1;
        await prisma.lightAutomation.updateMany({
          where: { id: rule.id, householdId: household.id },
          data: {
            lastRunResult: truncateLastRunResult(
              `failed: ${onStates2.message}`,
            ),
          },
        });
        continue;
      }

      // Re-check eligibility against the post-claim set (subset of pre-claim).
      const stillEligible = isToggle
        ? collectToggleEligibleTargets(eligible, onStates2)
        : collectEligibleTargets(eligible, onStates2, wantOn);
      if (stillEligible.length === 0) {
        result.skipped += 1;
        await prisma.lightAutomation.updateMany({
          where: { id: rule.id, householdId: household.id },
          data: {
            lastRunResult: truncateLastRunResult(
              isToggle
                ? "skipped:unknown_isOn"
                : wantOn
                  ? "skipped:already_on"
                  : "skipped:already_off",
            ),
          },
        });
        continue;
      }

      const applied = await applyAutomationAction(household.id, rule.id, {
        onlyDeviceIds: stillEligible,
        updateLastRunAt: false,
      });
      if (isDomainError(applied) || applied.failed === applied.attempted) {
        result.failed += 1;
      } else {
        result.applied += 1;
      }
    }
  }

  return result;
}

/** Rising-edge convenience wrapper (T-068 smoke / callers). */
export async function handleSensorRisingEdge(input: {
  sensorId: string;
  attribute: string;
  receivedAt: Date;
}): Promise<HandleSensorEdgeResult> {
  return handleSensorEdge({ ...input, polarity: "rising" });
}
