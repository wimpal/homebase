import { prisma } from "@/core/db";
import { DomainError, type DomainResult } from "@/domain/error";
import { setDirigeraLightState } from "@/domain/smarthome";
import type { ApplyAutomationOptions, ApplyAutomationResult } from "./types";
import { truncateLastRunResult } from "./validate";

/**
 * Apply a LightAutomation's action via setDirigeraLightState.
 *
 * Does not set `lastFiredSlot` — that claim is reserved for the T-066 worker
 * (once-per-window). Manual/script applies may re-run freely when enabled.
 *
 * Sensor path (T-068): claim cooldown before calling; pass onlyDeviceIds for
 * lights that are off; set updateLastRunAt: false so the claim timestamp sticks.
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

  let succeeded = 0;
  let failed = 0;
  let firstError: string | undefined;

  for (const target of targets) {
    const stillEnabled = await prisma.lightAutomation.findFirst({
      where: { id, householdId, enabled: true },
      select: { id: true },
    });
    if (!stillEnabled) {
      return DomainError.conflict("Automation is disabled");
    }

    const result = await setDirigeraLightState(
      target.dirigeraDeviceId,
      row.on,
      stateOptions,
    );
    if (result.success) {
      succeeded += 1;
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
    lastRunResult = "ok";
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
