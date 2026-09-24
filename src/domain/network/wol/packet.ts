import { DomainError } from "@/domain/error";
import { isDomainError } from "@/domain/error";
import { parseScanCidr } from "../scan/cidr";

/** Best-effort in-process cooldown (single NAS app replica). */
export const WOL_COOLDOWN_MS = 60_000;

const lastWakeByDeviceKey = new Map<string, number>();

function deviceKey(householdId: string, deviceId: string): string {
  return `${householdId}:${deviceId}`;
}

/** Reserve a wake slot before any await. Returns DomainError if still cooling down. */
export function tryReserveWake(
  householdId: string,
  deviceId: string,
): DomainError | null {
  const key = deviceKey(householdId, deviceId);
  const now = Date.now();
  const last = lastWakeByDeviceKey.get(key) ?? 0;
  if (now - last < WOL_COOLDOWN_MS) {
    return new DomainError(
      "conflict",
      "Wake rate limit: wait before retrying.",
      true,
      "wake_rate_limited",
    );
  }
  lastWakeByDeviceKey.set(key, now);
  return null;
}

/** Test helper — clear all cooldown entries. */
export function clearWakeRateLimits(): void {
  lastWakeByDeviceKey.clear();
}

/**
 * Resolve UDP broadcast target:
 * 1. HOME_NETWORK_WOL_BROADCAST if set
 * 2. Directed broadcast from HOME_NETWORK_SCAN_CIDR
 * 3. 255.255.255.255
 */
export function resolveWolBroadcast(): string {
  const explicit = process.env.HOME_NETWORK_WOL_BROADCAST?.trim();
  if (explicit) {
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(explicit);
    if (m) {
      const octets = m.slice(1).map(Number);
      if (octets.every((n) => n <= 255)) return octets.join(".");
    }
  }
  const cidr = parseScanCidr(process.env.HOME_NETWORK_SCAN_CIDR);
  if (!isDomainError(cidr)) return cidr.broadcast;
  return "255.255.255.255";
}

export function isWolDryRun(): boolean {
  return process.env.HOMEBASE_WOL_DRY_RUN === "1";
}

/** Build classic WoL magic packet: 6×0xff + 16×MAC. */
export function buildMagicPacket(macNormalized: string): Buffer {
  const hex = macNormalized.replace(/:/g, "");
  const macBytes = Buffer.alloc(6);
  for (let i = 0; i < 6; i++) {
    macBytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  const packet = Buffer.alloc(102);
  packet.fill(0xff, 0, 6);
  for (let i = 0; i < 16; i++) {
    macBytes.copy(packet, 6 + i * 6);
  }
  return packet;
}
