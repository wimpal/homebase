import { isDomainError } from "@/domain/error";
import { isDirigeraConfigured } from "./client";
import { listDirigeraLights } from "./list-lights";
import { setDirigeraLightState } from "./set-light-state";
import type { DirigeraLight, DirigeraPartyModeResult } from "./types";

/** Default show length when duration_seconds is omitted. */
const DEFAULT_DURATION_S = 15;
/** Maximum show length (server-side clamp). */
const MAX_DURATION_S = 60;
/** Half-cycle delay between on/off toggles (~500ms per half-cycle). */
const HALF_CYCLE_MS = 500;

let partyModeRunning = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampDuration(seconds: number): number {
  return Math.min(MAX_DURATION_S, Math.max(1, seconds));
}

async function setAll(targets: DirigeraLight[], on: boolean): Promise<void> {
  for (const light of targets) {
    await setDirigeraLightState(light.id, on);
  }
}

async function restoreSnapshot(snapshot: Map<string, boolean>): Promise<boolean> {
  let allRestored = true;
  for (const [deviceId, isOn] of snapshot) {
    const result = await setDirigeraLightState(deviceId, isOn);
    if (!result.success) {
      allRestored = false;
    }
  }
  return allRestored;
}

/**
 * Party mode v1: all reachable IKEA lights flicker on/off together, then restore isOn only.
 * Out of scope: brightness restore, Hue, colour, cancel endpoint, parallel hub calls.
 */
export async function runDirigeraPartyMode(opts?: {
  durationSeconds?: number;
}): Promise<DirigeraPartyModeResult> {
  if (partyModeRunning) {
    return { success: false, error: "Party mode already running" };
  }

  if (!isDirigeraConfigured()) {
    return { success: false, error: "Dirigera not configured" };
  }

  const durationS = clampDuration(opts?.durationSeconds ?? DEFAULT_DURATION_S);

  const lightsResult = await listDirigeraLights();
  if (isDomainError(lightsResult)) {
    return { success: false, error: lightsResult.message };
  }

  const targets = lightsResult.filter((light) => light.isReachable);
  if (targets.length === 0) {
    return { success: false, error: "no reachable lights" };
  }

  const snapshot = new Map(targets.map((light) => [light.id, light.isOn]));
  let cycles = 0;
  let restored = false;

  partyModeRunning = true;
  const end = Date.now() + durationS * 1000;

  try {
    while (Date.now() < end) {
      await setAll(targets, true);
      await sleep(HALF_CYCLE_MS);
      await setAll(targets, false);
      await sleep(HALF_CYCLE_MS);
      cycles++;
    }
  } finally {
    restored = await restoreSnapshot(snapshot);
    partyModeRunning = false;
  }

  return {
    success: true,
    duration_seconds: durationS,
    devices_affected: targets.length,
    cycles,
    restored,
  };
}
