/** Floor delay after WoL before first SSAP poll (ms). */
export const SSAP_WAKE_FLOOR_MS = 8_000;
/** Interval between SSAP connect polls (ms). */
export const SSAP_POLL_INTERVAL_MS = 2_000;
/** Max wait for SSAP after wake starts (ms), including floor. */
export const SSAP_READY_TIMEOUT_MS = 90_000;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * After WoL: wait floor, then poll `probe` until true or timeout.
 * Returns false on timeout.
 */
export async function waitUntilSsapReady(
  probe: () => Promise<boolean>,
  opts?: {
    floorMs?: number;
    intervalMs?: number;
    timeoutMs?: number;
  },
): Promise<boolean> {
  const floorMs = opts?.floorMs ?? SSAP_WAKE_FLOOR_MS;
  const intervalMs = opts?.intervalMs ?? SSAP_POLL_INTERVAL_MS;
  const timeoutMs = opts?.timeoutMs ?? SSAP_READY_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;

  if (floorMs > 0) await sleep(floorMs);

  while (Date.now() < deadline) {
    try {
      if (await probe()) return true;
    } catch {
      // keep polling
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await sleep(Math.min(intervalMs, remaining));
  }
  return false;
}
