import { prisma } from "@/core/db";
import { isDomainError } from "@/domain/error";
import { launchAppNetworkDevice } from "@/domain/network/ssap/control";
import { setDirigeraLightState } from "@/domain/smarthome/set-light-state";
import { AUTOMATION_TIMEZONE_V1 } from "@/domain/automations/types";
import { isPastCutoff } from "./cutoff";
import { assertProtocolsEnabled } from "./module-gate";
import { resolveProtocol } from "./registry";
import type { ProtocolRunResult, RunCinemaDeps } from "./types";

/** Per-household in-flight lock (multi-tenant; party-mode pattern). */
const runningByHousehold = new Set<string>();

/** Test helper — clear locks between selftest cases. */
export function __clearProtocolRunLocksForTests(): void {
  runningByHousehold.clear();
}

async function defaultLaunchTv(
  householdId: string,
  deviceId: string,
): Promise<
  { ok: true; dry_run?: boolean } | { ok: false; error: string }
> {
  const result = await launchAppNetworkDevice(
    householdId,
    deviceId,
    "jellyfin",
    true,
  );
  if (isDomainError(result)) {
    return { ok: false, error: result.message };
  }
  if (result.status === "dry_run") {
    return { ok: true, dry_run: true };
  }
  return { ok: true };
}

async function defaultSetLight(
  deviceId: string,
  on: boolean,
  brightness: number,
): Promise<{ success: boolean; error?: string }> {
  const result = await setDirigeraLightState(deviceId, on, { brightness });
  if (!result.success) {
    return { success: false, error: result.error ?? "Light write failed" };
  }
  return { success: true };
}

export async function runProtocol(
  householdId: string,
  name: string,
  deps: RunCinemaDeps = {},
): Promise<ProtocolRunResult> {
  const gated = await assertProtocolsEnabled(householdId);
  if (gated) {
    return {
      success: false,
      status: "failed",
      error: gated.message,
    };
  }

  const protocol = resolveProtocol(name);
  if (!protocol) {
    return {
      success: false,
      status: "not_found",
      error: `Unknown Protocol "${name.trim()}".`,
    };
  }

  if (protocol.id !== "cinema") {
    return {
      success: false,
      id: protocol.id,
      name: protocol.name,
      status: "failed",
      error: `Protocol "${protocol.name}" is not executable yet.`,
      notes: ["Blinds and other steps are stubbed — not executed in v1."],
    };
  }

  return runCinemaProtocol(householdId, deps);
}

async function runCinemaProtocol(
  householdId: string,
  deps: RunCinemaDeps,
): Promise<ProtocolRunResult> {
  if (runningByHousehold.has(householdId)) {
    return {
      success: false,
      id: "cinema",
      name: "Cinema",
      status: "already_running",
      error: "Cinema protocol is already running.",
    };
  }

  runningByHousehold.add(householdId);
  try {
    return await executeCinema(householdId, deps);
  } finally {
    runningByHousehold.delete(householdId);
  }
}

async function executeCinema(
  householdId: string,
  deps: RunCinemaDeps,
): Promise<ProtocolRunResult> {
  const now = deps.now ?? new Date();
  const launchTv = deps.launchTv ?? defaultLaunchTv;
  const setLight = deps.setLight ?? defaultSetLight;

  const household = await prisma.household.findUnique({
    where: { id: householdId },
    select: { timezone: true },
  });
  const timezone = household?.timezone || AUTOMATION_TIMEZONE_V1;

  const settings = await prisma.protocolCinemaSettings.findUnique({
    where: { householdId },
  });

  const tvId = settings?.networkDeviceId?.trim() || null;
  if (!tvId) {
    return {
      success: false,
      id: "cinema",
      name: "Cinema",
      status: "failed",
      error:
        "Cinema has no TV configured. Pick a wake-capable paired TV in Protocols settings.",
    };
  }

  // Re-validate capabilities at run (settings may have drifted).
  const tv = await prisma.networkDevice.findFirst({
    where: { id: tvId, householdId },
  });
  if (!tv || tv.retiredAt) {
    return {
      success: false,
      id: "cinema",
      name: "Cinema",
      status: "failed",
      error: "Configured Cinema TV is missing or retired.",
    };
  }
  if (!tv.ssapClientKey) {
    return {
      success: false,
      id: "cinema",
      name: "Cinema",
      status: "failed",
      error: "Configured Cinema TV is not paired for SSAP.",
    };
  }
  if (!tv.wakeAllowed || !tv.macAddress) {
    return {
      success: false,
      id: "cinema",
      name: "Cinema",
      status: "failed",
      error: "Configured Cinema TV is not wake-capable.",
    };
  }

  const tvResult = await launchTv(householdId, tvId);
  if (!tvResult.ok) {
    return {
      success: false,
      id: "cinema",
      name: "Cinema",
      status: "failed",
      tv: { ok: false, error: tvResult.error },
      lights: {
        applied: false,
        skipped_reason: "tv_failed",
        cutoff_hhmm: settings?.cutoffHhMm ?? "18:00",
      },
      error: tvResult.error,
      notes: ["Lights were not changed because the TV step failed."],
    };
  }

  // SSAP dry-run must not proceed to real Dirigera writes.
  if (tvResult.dry_run) {
    return {
      success: true,
      id: "cinema",
      name: "Cinema",
      status: "ok_tv_only",
      tv: { ok: true },
      lights: {
        applied: false,
        cutoff_hhmm: settings?.cutoffHhMm ?? "18:00",
      },
      notes: [
        "SSAP dry-run — TV step simulated; lights were not changed.",
      ],
    };
  }

  const cutoffHhMm = settings?.cutoffHhMm ?? "18:00";
  const pastCutoff = isPastCutoff(now, cutoffHhMm, timezone);

  if (!pastCutoff) {
    return {
      success: true,
      id: "cinema",
      name: "Cinema",
      status: "ok_tv_only",
      tv: { ok: true },
      lights: {
        applied: false,
        skipped_reason: "before_cutoff",
        cutoff_hhmm: cutoffHhMm,
      },
      notes: [
        `Lights skipped — before evening cutoff ${cutoffHhMm} (${timezone}).`,
      ],
    };
  }

  const selected = settings?.selectedLightIds ?? [];
  if (selected.length === 0) {
    return {
      success: true,
      id: "cinema",
      name: "Cinema",
      status: "ok",
      tv: { ok: true },
      lights: {
        applied: false,
        skipped_reason: "empty_selection",
        cutoff_hhmm: cutoffHhMm,
      },
      notes: [
        "Lights step skipped — no lamps selected (TV still ran).",
      ],
    };
  }

  const locationId = settings?.deviceLocationId;
  const roomName = settings?.dirigeraRoomName?.trim();
  if (!locationId || !roomName) {
    return {
      success: false,
      id: "cinema",
      name: "Cinema",
      status: "failed",
      tv: { ok: true },
      lights: {
        applied: false,
        cutoff_hhmm: cutoffHhMm,
      },
      error:
        "Cinema room map is incomplete. Set Device location → Dirigera room before running lights.",
      notes: [
        "TV woke and Jellyfin launched; lights were not changed.",
      ],
    };
  }

  const dim = settings?.dimBrightness ?? 30;
  const results: { device_id: string; success: boolean; error?: string }[] =
    [];
  for (const deviceId of selected) {
    const write = await setLight(deviceId, true, dim);
    results.push(
      write.success
        ? { device_id: deviceId, success: true }
        : {
            device_id: deviceId,
            success: false,
            error: write.error ?? "Light write failed",
          },
    );
  }

  const anyFailed = results.some((r) => !r.success);
  return {
    success: !anyFailed,
    id: "cinema",
    name: "Cinema",
    status: anyFailed ? "failed" : "ok",
    tv: { ok: true },
    lights: {
      applied: results.some((r) => r.success),
      cutoff_hhmm: cutoffHhMm,
      results,
    },
    ...(anyFailed
      ? {
          error: "One or more Cinema lamps failed to set.",
          notes: ["TV step succeeded; some lights failed."],
        }
      : {
          notes: [`Set ${results.length} lamp(s) on at dim ${dim}.`],
        }),
  };
}
