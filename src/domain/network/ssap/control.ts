import type {
  DeviceLocation,
  NetworkDevice,
  NetworkDeviceType,
} from "@prisma/client";
import { prisma } from "@/core/db";
import { DomainError, isDomainError } from "@/domain/error";
import { wakeNetworkDevice } from "../wake";
import { assertHomeNetworkEnabled } from "../module-gate";
import { toNetworkDeviceDetail } from "../map";
import type {
  TvControlResult,
  TvInputId,
  TvLaunchTarget,
} from "../types";
import {
  isSsapDryRun,
  openSsapSession,
  probeSsapPort,
  ssapLaunchApp,
  ssapPowerOff,
  ssapSwitchInput,
  type SsapSession,
} from "./client";
import { resolveSsapHost } from "./host";
import { waitUntilSsapReady } from "./ready";
import { tryReserveSsapWrite } from "./rate-limit";
import {
  inputLaunchAppId,
  resolveLaunchAppId,
  switchInputId,
} from "./targets";

type PairedRow = NetworkDevice & {
  type: NetworkDeviceType;
  location: DeviceLocation;
  ssapClientKey: string;
};

async function loadPairedRow(
  householdId: string,
  deviceId: string,
): Promise<PairedRow | DomainError> {
  const gated = await assertHomeNetworkEnabled(householdId);
  if (gated) return gated;

  const id = (deviceId ?? "").trim();
  if (!id) {
    return DomainError.invalidInput("Invalid network device id.", "invalid_id");
  }

  const row = await prisma.networkDevice.findFirst({
    where: { id, householdId },
    include: { type: true, location: true },
  });
  if (!row) {
    return DomainError.notFound("Network device not found.", "device_not_found");
  }
  if (row.retiredAt) {
    return DomainError.invalidInput(
      "Cannot control a retired device.",
      "device_retired",
    );
  }
  if (!row.ssapClientKey) {
    return DomainError.invalidInput(
      "TV is not paired for SSAP control.",
      "ssap_unpaired",
    );
  }
  return row as PairedRow;
}

async function withWakeIfNeeded(
  householdId: string,
  deviceId: string,
  wakeIfNeeded: boolean,
  host: string,
): Promise<"ok" | "woke_and_ok" | DomainError> {
  if (!wakeIfNeeded) return "ok";

  const wake = await wakeNetworkDevice(householdId, deviceId);
  if (isDomainError(wake)) return wake;

  const ready = await waitUntilSsapReady(() => probeSsapPort(host));
  if (!ready) {
    return DomainError.unavailable(
      "TV did not become ready for SSAP after wake.",
      "ssap_ready_timeout",
    );
  }
  return "woke_and_ok";
}

async function executeSsap(
  householdId: string,
  row: PairedRow,
  action: TvControlResult["action"],
  wakeIfNeeded: boolean,
  run: (session: SsapSession) => Promise<void>,
): Promise<TvControlResult | DomainError> {
  const limited = tryReserveSsapWrite(householdId, row.id);
  if (limited) return limited;

  const host = resolveSsapHost(row.ssapHost, row.lastSeenIp);
  if (isDomainError(host)) return host;

  const detail = toNetworkDeviceDetail(row);

  if (isSsapDryRun()) {
    if (wakeIfNeeded) {
      const wake = await wakeNetworkDevice(householdId, row.id);
      if (isDomainError(wake)) return wake;
    }
    return {
      id: detail.id,
      name: detail.name,
      status: "dry_run",
      action,
    };
  }

  const wakeStatus = await withWakeIfNeeded(
    householdId,
    row.id,
    wakeIfNeeded,
    host,
  );
  if (isDomainError(wakeStatus)) return wakeStatus;

  const session = await openSsapSession(host, row.ssapClientKey);
  if (isDomainError(session)) return session;

  try {
    await run(session);
  } catch {
    return DomainError.unavailable(
      "TV SSAP command failed.",
      "ssap_command_failed",
    );
  } finally {
    session.close();
  }

  return {
    id: detail.id,
    name: detail.name,
    status: wakeStatus === "woke_and_ok" ? "woke_and_ok" : "ok",
    action,
  };
}

export async function goHomeNetworkDevice(
  householdId: string,
  deviceId: string,
  wakeIfNeeded = false,
): Promise<TvControlResult | DomainError> {
  const row = await loadPairedRow(householdId, deviceId);
  if (isDomainError(row)) return row;
  const appId = resolveLaunchAppId("home", row.jellyfinAppId);
  if (isDomainError(appId)) return appId;

  return executeSsap(householdId, row, "go_home", wakeIfNeeded, (session) =>
    ssapLaunchApp(session, appId),
  );
}

export async function launchAppNetworkDevice(
  householdId: string,
  deviceId: string,
  target: TvLaunchTarget,
  wakeIfNeeded = false,
): Promise<TvControlResult | DomainError> {
  const row = await loadPairedRow(householdId, deviceId);
  if (isDomainError(row)) return row;
  const appId = resolveLaunchAppId(target, row.jellyfinAppId);
  if (isDomainError(appId)) return appId;

  return executeSsap(householdId, row, "launch_app", wakeIfNeeded, (session) =>
    ssapLaunchApp(session, appId),
  );
}

export async function setInputNetworkDevice(
  householdId: string,
  deviceId: string,
  input: TvInputId,
  wakeIfNeeded = false,
): Promise<TvControlResult | DomainError> {
  const row = await loadPairedRow(householdId, deviceId);
  if (isDomainError(row)) return row;

  const switchId = switchInputId(input);
  const fallback = inputLaunchAppId(input);

  return executeSsap(householdId, row, "set_input", wakeIfNeeded, (session) =>
    ssapSwitchInput(session, switchId, fallback),
  );
}

export async function powerOffNetworkDevice(
  householdId: string,
  deviceId: string,
): Promise<TvControlResult | DomainError> {
  const row = await loadPairedRow(householdId, deviceId);
  if (isDomainError(row)) return row;

  return executeSsap(householdId, row, "power_off", false, (session) =>
    ssapPowerOff(session),
  );
}
