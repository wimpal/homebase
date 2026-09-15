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
} from "./types";
import { truncateLastRunResult } from "./validate";

/** In-process debounce: sensor device id → last rising-edge receipt ms. */
const lastRisingEdgeAt = new Map<string, number>();

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
  lastRisingEdgeAt.clear();
}

export function shouldDebounceRisingEdge(
  sensorId: string,
  receivedAtMs: number,
  debounceMs: number = SENSOR_DEBOUNCE_MS,
): boolean {
  const prev = lastRisingEdgeAt.get(sensorId);
  if (prev != null && receivedAtMs - prev < debounceMs) {
    return true;
  }
  lastRisingEdgeAt.set(sensorId, receivedAtMs);
  return false;
}

function collectOffTargets(
  targetIds: string[],
  onById: Map<string, boolean | null>,
): string[] {
  const off: string[] = [];
  for (const id of targetIds) {
    const isOn = onById.get(id);
    // Unknown / missing isOn → skip (not treat as off).
    if (isOn === false) off.push(id);
  }
  return off;
}

export type HandleSensorRisingEdgeResult = {
  rulesMatched: number;
  claimed: number;
  applied: number;
  skipped: number;
  failed: number;
};

/**
 * Handle a rising edge on a Dirigera edge sensor (local receipt time).
 * Hub-down → no claim. Boot/seed must not call this.
 * Off-check happens before cooldown claim so already-on does not burn cooldown.
 */
export async function handleSensorRisingEdge(input: {
  sensorId: string;
  attribute: string;
  receivedAt: Date;
}): Promise<HandleSensorRisingEdgeResult> {
  const result: HandleSensorRisingEdgeResult = {
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
    shouldDebounceRisingEdge(input.sensorId, input.receivedAt.getTime())
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
      },
      select: {
        id: true,
        targets: { select: { dirigeraDeviceId: true } },
      },
    });

    for (const rule of rules) {
      result.rulesMatched += 1;
      const targetIds = rule.targets.map((t) => t.dirigeraDeviceId);

      const onStates = await listDirigeraLightOnStates();
      if (isDomainError(onStates)) {
        result.failed += 1;
        continue;
      }

      const offTargets = collectOffTargets(targetIds, onStates);
      if (offTargets.length === 0) {
        result.skipped += 1;
        await prisma.lightAutomation.updateMany({
          where: { id: rule.id, householdId: household.id },
          data: {
            lastRunResult: truncateLastRunResult("skipped:already_on"),
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

      // Re-check immediately before write.
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

      const stillOff = collectOffTargets(offTargets, onStates2);
      if (stillOff.length === 0) {
        result.skipped += 1;
        await prisma.lightAutomation.updateMany({
          where: { id: rule.id, householdId: household.id },
          data: {
            lastRunResult: truncateLastRunResult("skipped:already_on"),
          },
        });
        continue;
      }

      const applied = await applyAutomationAction(household.id, rule.id, {
        onlyDeviceIds: stillOff,
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
