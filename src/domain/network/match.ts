import type { NetworkDevice } from "@prisma/client";
import { normalizeHostname, normalizeIp, normalizeMacAddress } from "./identity";
import { isDomainError } from "@/domain/error";

export type CandidateMatchStatus =
  | "new"
  | "enrolled"
  | "ambiguous"
  | "retired";

export type ScanCandidateInput = {
  ip: string;
  mac?: string | null;
  hostname?: string | null;
};

export type CandidateMatch = {
  status: CandidateMatchStatus;
  deviceId?: string;
  deviceName?: string;
  matchReason: string;
};

type DeviceRow = Pick<
  NetworkDevice,
  "id" | "name" | "retiredAt" | "macAddress" | "lastSeenIp" | "lastSeenHostname"
>;

/**
 * Match a scan candidate against enrolled Network devices.
 * MAC wins; else IP+hostname; IP-only → ambiguous (DHCP risk).
 */
export function matchCandidate(
  candidate: ScanCandidateInput,
  devices: DeviceRow[],
): CandidateMatch {
  const macNorm = normalizeMacAddress(candidate.mac);
  const mac =
    macNorm && !isDomainError(macNorm) ? macNorm : null;
  const ip = normalizeIp(candidate.ip) ?? candidate.ip.trim();
  const host = normalizeHostname(candidate.hostname);

  if (mac) {
    const byMac = devices.find((d) => d.macAddress === mac);
    if (byMac) {
      if (byMac.retiredAt) {
        return {
          status: "retired",
          deviceId: byMac.id,
          deviceName: byMac.name,
          matchReason: "mac",
        };
      }
      return {
        status: "enrolled",
        deviceId: byMac.id,
        deviceName: byMac.name,
        matchReason: "mac",
      };
    }
  }

  if (ip && host) {
    const both = devices.find(
      (d) =>
        d.lastSeenIp === ip &&
        d.lastSeenHostname &&
        d.lastSeenHostname.toLowerCase() === host.toLowerCase(),
    );
    if (both) {
      if (both.retiredAt) {
        return {
          status: "retired",
          deviceId: both.id,
          deviceName: both.name,
          matchReason: "ip_hostname",
        };
      }
      return {
        status: "enrolled",
        deviceId: both.id,
        deviceName: both.name,
        matchReason: "ip_hostname",
      };
    }
  }

  if (ip) {
    const byIp = devices.filter((d) => d.lastSeenIp === ip);
    if (byIp.length === 1) {
      const d = byIp[0];
      return {
        status: "ambiguous",
        deviceId: d.id,
        deviceName: d.name,
        matchReason: "ip_only",
      };
    }
    if (byIp.length > 1) {
      return {
        status: "ambiguous",
        matchReason: "ip_only_multiple",
      };
    }
  }

  return { status: "new", matchReason: "none" };
}
