import { prisma } from "@/core/db";
import { DomainError, isDomainError, type DomainResult } from "@/domain/error";
import {
  listDirigeraLightOnStates,
  setDirigeraLightState,
} from "@/domain/smarthome";
import type { ApplyAutomationOptions, ApplyAutomationResult } from "./types";
import { truncateLastRunResult } from "./validate";

/**
 * Apply a LightAutomation's action via setDirigeraLightState.
 *
 * Does not set `lastFiredSlot` — that claim is reserved for the T-066 worker
 * (once-per-window). Manual/script applies may re-run freely when enabled.
 *
 * Sensor path: claim cooldown before calling; pass onlyDeviceIds for eligible
 * lights; set updateLastRunAt: false so the claim timestamp sticks.
 *
 * SENSOR_EDGE Toggle leave-session: pass `forceOn` for explicit on/off (no flip).
 * BUTTON Toggle: flip each target's current isOn (forceOn ignored).
 * Run now on a SENSOR_EDGE toggle rule without forceOn turns lights on (enter path).
 */
export async function applyAutomationAction(
  householdId: string,
  id: string,
  options: ApplyAutomationOptions = {},
): Promise<DomainResult<ApplyAutomationResult>> {
  const row = await prisma.lightAutomation.findFirst({
    where: { id, householdId },
    include: { targets: true },
  });
  if (!row) {
    return DomainError.notFound(`No automation with id ${id}.`);
  }

  // Re-check enabled immediately before hub writes (disable race).
  const fresh = await prisma.lightAutomation.findFirst({
    where: { id, householdId },
    select: { enabled: true },
  });
  if (!fresh || !fresh.enabled) {
    return DomainError.conflict("Automation is disabled");
  }

  const only =
    options.onlyDeviceIds && options.onlyDeviceIds.length > 0
      ? new Set(options.onlyDeviceIds)
      : null;
  const targets = only
    ? row.targets.filter((t) => only.has(t.dirigeraDeviceId))
    : row.targets;

  const stateOptions = {
    ...(row.brightness != null ? { brightness: row.brightness } : {}),
    ...(row.colorTempKelvin != null
      ? { colorTempKelvin: row.colorTempKelvin }
      : {}),
  };

  const buttonFlip = row.toggle && row.triggerKind === "BUTTON";
  let onStates: Map<string, boolean | null> | null = null;
  if (buttonFlip) {
    const states = await listDirigeraLightOnStates();
    if (isDomainError(states)) {
      return states;
    }
    onStates = states;
  }

  let succeeded = 0;
  let failed = 0;
  let firstError: string | undefined;
  let lastDesiredOn: boolean | null = null;

  for (const target of targets) {
    const stillEnabled = await prisma.lightAutomation.findFirst({
      where: { id, householdId, enabled: true },
      select: { id: true },
    });
    if (!stillEnabled) {
      return DomainError.conflict("Automation is disabled");
    }

    let desiredOn = row.on;
    let optionsForWrite = stateOptions;

    if (buttonFlip && onStates) {
      const current = onStates.get(target.dirigeraDeviceId);
      desiredOn = current !== true;
      lastDesiredOn = desiredOn;
      optionsForWrite = desiredOn ? stateOptions : {};
    } else if (row.toggle) {
      // SENSOR_EDGE leave-session (or legacy): forceOn or default on.
      desiredOn = options.forceOn !== undefined ? options.forceOn : true;
      lastDesiredOn = desiredOn;
      optionsForWrite = desiredOn ? stateOptions : {};
    }

    const result = await setDirigeraLightState(
      target.dirigeraDeviceId,
      desiredOn,
      optionsForWrite,
    );
    if (result.success) {
      succeeded += 1;
      if (buttonFlip && onStates) {
        onStates.set(target.dirigeraDeviceId, desiredOn);
      }
    } else {
      failed += 1;
      if (!firstError) {
        firstError = result.error ?? "Unknown Dirigera error";
      }
    }
  }

  const attempted = targets.length;
  let lastRunResult: string;
  if (attempted === 0) {
    lastRunResult = "skipped:no_targets";
  } else if (failed === 0) {
    if (buttonFlip) {
      lastRunResult =
        lastDesiredOn === false ? "ok:button_flip_off" : "ok:button_flip_on";
    } else if (row.toggle) {
      lastRunResult =
        options.forceOn === false ? "ok:toggle_off" : "ok:toggle_on";
    } else {
      lastRunResult = "ok";
    }
  } else if (succeeded === 0) {
    lastRunResult = truncateLastRunResult(`failed: ${firstError}`);
  } else {
    lastRunResult = truncateLastRunResult(
      `partial: ${failed}/${attempted} failed: ${firstError}`,
    );
  }

  const lastRunAt = new Date();
  const updateLastRunAt = options.updateLastRunAt !== false;
  await prisma.lightAutomation.updateMany({
    where: { id, householdId },
    data: updateLastRunAt
      ? { lastRunAt, lastRunResult }
      : { lastRunResult },
  });

  return {
    id,
    lastRunAt: updateLastRunAt ? lastRunAt : (row.lastRunAt ?? lastRunAt),
    lastRunResult,
    attempted,
    succeeded,
    failed,
  };
}
