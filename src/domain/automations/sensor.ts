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
  normalizeToggleSession,
  type SensorEdgePolarity,
  type ToggleSession,
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

export type HandleSensorEdgeResult = {
  rulesMatched: number;
  claimed: number;
  applied: number;
  skipped: number;
  failed: number;
};

/** @deprecated alias */
export type HandleSensorRisingEdgeResult = HandleSensorEdgeResult;

async function setToggleSession(
  householdId: string,
  id: string,
  session: ToggleSession | null,
  lastRunResult?: string,
  /** Only update if current session matches (CAS). */
  expectSession?: ToggleSession | null,
): Promise<boolean> {
  const where: {
    id: string;
    householdId: string;
    toggleSession?: string | null;
  } = { id, householdId };
  if (expectSession !== undefined) {
    where.toggleSession =
      expectSession === "idle" || expectSession === null
        ? null
        : expectSession;
    // Also allow legacy idle stored as empty — Prisma null only for idle.
    if (expectSession === "idle" || expectSession === null) {
      // Match null only (normalizeToggleSession treats null as idle).
      where.toggleSession = null;
    }
  }
  const updated = await prisma.lightAutomation.updateMany({
    where,
    data: {
      toggleSession: session === "idle" ? null : session,
      ...(lastRunResult
        ? { lastRunResult: truncateLastRunResult(lastRunResult) }
        : {}),
    },
  });
  return updated.count === 1;
}

/**
 * Claim leave-off without rule cooldown — enter write must not block a leave
 * close a few seconds later. CAS clears toggleSession=leaving as the lock.
 */
async function claimLeaveOff(
  householdId: string,
  id: string,
): Promise<boolean> {
  const updated = await prisma.lightAutomation.updateMany({
    where: {
      id,
      householdId,
      enabled: true,
      triggerKind: LightAutomationTriggerKind.SENSOR_EDGE,
      toggle: true,
      toggleSession: "leaving",
    },
    data: {
      toggleSession: null,
      lastRunResult: truncateLastRunResult("claimed:leave_off"),
    },
  });
  return updated.count === 1;
}

/**
 * Leave-session Toggle:
 * idle+rising → on, occupied
 * occupied+falling → ignore (sit)
 * occupied+rising → leaving (light stays)
 * leaving+falling → off, idle
 * leaving+rising → stay leaving
 * idle+falling → ignore
 *
 * Cooldown only on enter-on writes. Leave-off uses session CAS (no cooldown).
 */
async function handleToggleLeaveSession(input: {
  householdId: string;
  ruleId: string;
  targetIds: string[];
  session: ToggleSession;
  polarity: SensorEdgePolarity;
  receivedAt: Date;
  result: HandleSensorEdgeResult;
}): Promise<void> {
  const { householdId, ruleId, targetIds, polarity, receivedAt, result } =
    input;
  const session = input.session;

  if (session === "idle" && polarity === "falling") {
    result.skipped += 1;
    return;
  }

  if (session === "idle" && polarity === "rising") {
    const onStates = await listDirigeraLightOnStates();
    if (isDomainError(onStates)) {
      result.failed += 1;
      return;
    }
    const eligible = collectEligibleTargets(targetIds, onStates, true);

    const claimed = await claimSensorCooldown(householdId, ruleId, receivedAt);
    if (!claimed) return;
    result.claimed += 1;

    if (eligible.length === 0) {
      result.skipped += 1;
      await setToggleSession(
        householdId,
        ruleId,
        "occupied",
        "session:occupied_already_on",
      );
      return;
    }

    const applied = await applyAutomationAction(householdId, ruleId, {
      onlyDeviceIds: eligible,
      updateLastRunAt: false,
      forceOn: true,
    });
    if (isDomainError(applied) || applied.failed === applied.attempted) {
      result.failed += 1;
      return;
    }
    result.applied += 1;
    await setToggleSession(householdId, ruleId, "occupied");
    return;
  }

  if (session === "occupied" && polarity === "falling") {
    result.skipped += 1;
    // CAS: only if still occupied (do not overwrite leaving).
    await setToggleSession(
      householdId,
      ruleId,
      "occupied",
      "ignored:occupied_close",
      "occupied",
    );
    return;
  }

  if (session === "occupied" && polarity === "rising") {
    result.skipped += 1;
    const ok = await setToggleSession(
      householdId,
      ruleId,
      "leaving",
      "session:leaving",
      "occupied",
    );
    if (!ok) result.skipped += 1;
    return;
  }

  if (session === "leaving" && polarity === "rising") {
    result.skipped += 1;
    await setToggleSession(
      householdId,
      ruleId,
      "leaving",
      "ignored:leaving_open",
      "leaving",
    );
    return;
  }

  if (session === "leaving" && polarity === "falling") {
    const onStates = await listDirigeraLightOnStates();
    if (isDomainError(onStates)) {
      result.failed += 1;
      return;
    }
    const eligible = collectEligibleTargets(targetIds, onStates, false);

    const claimed = await claimLeaveOff(householdId, ruleId);
    if (!claimed) return;
    result.claimed += 1;

    if (eligible.length === 0) {
      result.skipped += 1;
      await setToggleSession(
        householdId,
        ruleId,
        null,
        "session:idle_already_off",
      );
      return;
    }

    const applied = await applyAutomationAction(householdId, ruleId, {
      onlyDeviceIds: eligible,
      updateLastRunAt: false,
      forceOn: false,
    });
    if (isDomainError(applied) || applied.failed === applied.attempted) {
      result.failed += 1;
      // Restore leaving so a later close can retry (claim already cleared session).
      await setToggleSession(
        householdId,
        ruleId,
        "leaving",
        "failed:leave_off_restore",
      );
      return;
    }
    result.applied += 1;
    await setToggleSession(householdId, ruleId, null, "ok:toggle_off");
    return;
  }
}

/**
 * Handle a sensor edge (local receipt time). Hub-down → no claim.
 * Eligible-light check happens before cooldown claim (on/off rules).
 * Toggle leave-session matches both polarities for the sensor.
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
          { toggle: true },
          { toggle: false, sensorEdgePolarity: input.polarity },
          // Legacy non-toggle null polarity → rising only
          ...(input.polarity === "rising"
            ? [{ toggle: false, sensorEdgePolarity: null as string | null }]
            : []),
        ],
      },
      select: {
        id: true,
        on: true,
        toggle: true,
        toggleSession: true,
        targets: { select: { dirigeraDeviceId: true } },
      },
    });

    for (const rule of rules) {
      result.rulesMatched += 1;
      const targetIds = rule.targets.map((t) => t.dirigeraDeviceId);

      if (rule.toggle) {
        await handleToggleLeaveSession({
          householdId: household.id,
          ruleId: rule.id,
          targetIds,
          session: normalizeToggleSession(rule.toggleSession),
          polarity: input.polarity,
          receivedAt: input.receivedAt,
          result,
        });
        continue;
      }

      const wantOn = rule.on;

      const onStates = await listDirigeraLightOnStates();
      if (isDomainError(onStates)) {
        result.failed += 1;
        continue;
      }

      const eligible = collectEligibleTargets(targetIds, onStates, wantOn);
      if (eligible.length === 0) {
        result.skipped += 1;
        await prisma.lightAutomation.updateMany({
          where: { id: rule.id, householdId: household.id },
          data: {
            lastRunResult: truncateLastRunResult(
              wantOn ? "skipped:already_on" : "skipped:already_off",
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

      const stillEligible = collectEligibleTargets(eligible, onStates2, wantOn);
      if (stillEligible.length === 0) {
        result.skipped += 1;
        await prisma.lightAutomation.updateMany({
          where: { id: rule.id, householdId: household.id },
          data: {
            lastRunResult: truncateLastRunResult(
              wantOn ? "skipped:already_on" : "skipped:already_off",
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
