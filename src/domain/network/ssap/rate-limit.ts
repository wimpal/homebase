import { DomainError } from "@/domain/error";

/** Best-effort in-process cooldown for TV SSAP writes (single NAS replica). */
export const SSAP_COOLDOWN_MS = 5_000;

const lastByDeviceKey = new Map<string, number>();

function deviceKey(householdId: string, deviceId: string): string {
  return `${householdId}:${deviceId}`;
}

export function tryReserveSsapWrite(
  householdId: string,
  deviceId: string,
): DomainError | null {
  const key = deviceKey(householdId, deviceId);
  const now = Date.now();
  const last = lastByDeviceKey.get(key) ?? 0;
  if (now - last < SSAP_COOLDOWN_MS) {
    return new DomainError(
      "conflict",
      "TV control rate limit: wait before retrying.",
      true,
      "ssap_rate_limited",
    );
  }
  lastByDeviceKey.set(key, now);
  return null;
}

/** Test helper. */
export function clearSsapRateLimits(): void {
  lastByDeviceKey.clear();
}
