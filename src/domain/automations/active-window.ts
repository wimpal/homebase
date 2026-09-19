/**
 * Optional active hours for LightAutomation (local HH:MM).
 * Both null/empty = all day. Inclusive at minute granularity.
 * When from > until, the window wraps overnight (e.g. 22:00–06:00).
 */
export function isWithinActiveWindow(
  nowLocal: string,
  activeFromLocal: string | null | undefined,
  activeUntilLocal: string | null | undefined,
): boolean {
  const from = activeFromLocal?.trim() || null;
  const until = activeUntilLocal?.trim() || null;
  if (!from && !until) return true;
  if (!from || !until) return true; // invalid half-set treated as all day at gate time

  if (from <= until) {
    return nowLocal >= from && nowLocal <= until;
  }
  // Overnight wrap: active from `from` through midnight, or from midnight through `until`.
  return nowLocal >= from || nowLocal <= until;
}
