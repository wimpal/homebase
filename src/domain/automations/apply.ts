import { prisma } from "@/core/db";
import { DomainError, type DomainResult } from "@/domain/error";
import { setDirigeraLightState } from "@/domain/smarthome";
import type { ApplyAutomationResult } from "./types";
import { truncateLastRunResult } from "./validate";

/**
 * Apply a LightAutomation's action via setDirigeraLightState.
 *
 * Does not set `lastFiredSlot` — that claim is reserved for the T-066 worker
 * (once-per-window). Manual/script applies may re-run freely when enabled.
 *
 * Phase A worker policy (T-066): claim `lastFiredSlot` before calling this;
 * claim-then-apply once per slot is enough (no in-apply retry on partial).
 */
export async function applyAutomationAction(
  householdId: string,
  id: string,
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

  const options = {
    ...(row.brightness != null ? { brightness: row.brightness } : {}),
    ...(row.colorTempKelvin != null
      ? { colorTempKelvin: row.colorTempKelvin }
      : {}),
  };

  let succeeded = 0;
  let failed = 0;
  let firstError: string | undefined;

  for (const target of row.targets) {
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
      options,
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

  const attempted = row.targets.length;
  let lastRunResult: string;
  if (failed === 0) {
    lastRunResult = "ok";
  } else if (succeeded === 0) {
    lastRunResult = truncateLastRunResult(`failed: ${firstError}`);
  } else {
    lastRunResult = truncateLastRunResult(
      `partial: ${failed}/${attempted} failed: ${firstError}`,
    );
  }

  const lastRunAt = new Date();
  await prisma.lightAutomation.updateMany({
    where: { id, householdId },
    data: { lastRunAt, lastRunResult },
  });

  return {
    id,
    lastRunAt,
    lastRunResult,
    attempted,
    succeeded,
    failed,
  };
}
