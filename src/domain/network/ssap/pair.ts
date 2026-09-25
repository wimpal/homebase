import { prisma } from "@/core/db";
import { DomainError, isDomainError } from "@/domain/error";
import { assertHomeNetworkEnabled } from "../module-gate";
import { toNetworkDeviceDetail } from "../map";
import type { NetworkDeviceDetail, SsapAppListItem } from "../types";
import {
  isSsapDryRun,
  openSsapSession,
  ssapListApps,
} from "./client";
import { resolveSsapHost } from "./host";

export type PairNetworkDeviceResult = {
  device: NetworkDeviceDetail;
  /** Apps when listApps succeeded after pair; empty on dry-run / failure. */
  apps: SsapAppListItem[];
};

/**
 * ADMIN: open SSAP without a stored key (on-TV prompt), persist client key.
 */
export async function pairNetworkDeviceSsap(
  householdId: string,
  deviceId: string,
): Promise<PairNetworkDeviceResult | DomainError> {
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
      "Cannot pair a retired device.",
      "device_retired",
    );
  }

  const host = resolveSsapHost(row.ssapHost, row.lastSeenIp);
  if (isDomainError(host)) return host;

  if (isSsapDryRun()) {
    const fakeKey = `dry-run-key-${id.slice(0, 8)}`;
    const updated = await prisma.networkDevice.update({
      where: { id },
      data: {
        ssapClientKey: fakeKey,
        ssapPairedAt: new Date(),
      },
      include: { type: true, location: true },
    });
    return { device: toNetworkDeviceDetail(updated), apps: [] };
  }

  const session = await openSsapSession(host, null);
  if (isDomainError(session)) return session;

  const clientKey = session.clientKey;
  let apps: SsapAppListItem[] = [];
  try {
    apps = await ssapListApps(session);
  } catch {
    apps = [];
  } finally {
    session.close();
  }

  const updated = await prisma.networkDevice.update({
    where: { id },
    data: {
      ssapClientKey: clientKey,
      ssapPairedAt: new Date(),
    },
    include: { type: true, location: true },
  });

  return { device: toNetworkDeviceDetail(updated), apps };
}

/** ADMIN: clear SSAP client key / paired-at. */
export async function clearNetworkDeviceSsap(
  householdId: string,
  deviceId: string,
): Promise<NetworkDeviceDetail | DomainError> {
  const gated = await assertHomeNetworkEnabled(householdId);
  if (gated) return gated;

  const id = (deviceId ?? "").trim();
  if (!id) {
    return DomainError.invalidInput("Invalid network device id.", "invalid_id");
  }

  const existing = await prisma.networkDevice.findFirst({
    where: { id, householdId },
  });
  if (!existing) {
    return DomainError.notFound("Network device not found.", "device_not_found");
  }

  const updated = await prisma.networkDevice.update({
    where: { id },
    data: {
      ssapClientKey: null,
      ssapPairedAt: null,
    },
    include: { type: true, location: true },
  });
  return toNetworkDeviceDetail(updated);
}

/**
 * ADMIN: list installed apps on a paired TV (for Jellyfin app id picker).
 */
export async function listNetworkDeviceSsapApps(
  householdId: string,
  deviceId: string,
): Promise<SsapAppListItem[] | DomainError> {
  const gated = await assertHomeNetworkEnabled(householdId);
  if (gated) return gated;

  const id = (deviceId ?? "").trim();
  if (!id) {
    return DomainError.invalidInput("Invalid network device id.", "invalid_id");
  }

  const row = await prisma.networkDevice.findFirst({
    where: { id, householdId },
  });
  if (!row) {
    return DomainError.notFound("Network device not found.", "device_not_found");
  }
  if (row.retiredAt) {
    return DomainError.invalidInput(
      "Cannot list apps on a retired device.",
      "device_retired",
    );
  }
  if (!row.ssapClientKey) {
    return DomainError.invalidInput(
      "TV is not paired for SSAP control.",
      "ssap_unpaired",
    );
  }

  const host = resolveSsapHost(row.ssapHost, row.lastSeenIp);
  if (isDomainError(host)) return host;

  if (isSsapDryRun()) {
    return [
      { id: "com.webos.app.home", title: "Home (dry-run)" },
      { id: "jellyfin.dry.run", title: "Jellyfin (dry-run)" },
    ];
  }

  const session = await openSsapSession(host, row.ssapClientKey);
  if (isDomainError(session)) return session;
  try {
    return await ssapListApps(session);
  } catch {
    return DomainError.unavailable(
      "Could not list apps on the TV.",
      "ssap_list_apps_failed",
    );
  } finally {
    session.close();
  }
}

/** ADMIN: set optional SSAP host and/or Jellyfin app id (never the key). */
export async function updateNetworkDeviceSsapSettings(
  householdId: string,
  deviceId: string,
  input: { ssap_host?: string | null; jellyfin_app_id?: string | null },
): Promise<NetworkDeviceDetail | DomainError> {
  const gated = await assertHomeNetworkEnabled(householdId);
  if (gated) return gated;

  const id = (deviceId ?? "").trim();
  if (!id) {
    return DomainError.invalidInput("Invalid network device id.", "invalid_id");
  }

  const existing = await prisma.networkDevice.findFirst({
    where: { id, householdId },
  });
  if (!existing) {
    return DomainError.notFound("Network device not found.", "device_not_found");
  }

  const data: { ssapHost?: string | null; jellyfinAppId?: string | null } = {};
  if (input.ssap_host !== undefined) {
    const h = (input.ssap_host ?? "").trim();
    data.ssapHost = h || null;
  }
  if (input.jellyfin_app_id !== undefined) {
    const j = (input.jellyfin_app_id ?? "").trim();
    data.jellyfinAppId = j || null;
  }

  const updated = await prisma.networkDevice.update({
    where: { id },
    data,
    include: { type: true, location: true },
  });
  return toNetworkDeviceDetail(updated);
}
