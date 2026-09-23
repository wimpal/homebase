/**
 * Format a date-only (@db.Date) value as DD-MM-YYYY without local timezone shift.
 */
export function formatBirthdayDdMmYyyy(value: Date | null | undefined): string | null {
  if (!value) return null;
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, "0");
  const d = String(value.getUTCDate()).padStart(2, "0");
  return `${d}-${m}-${y}`;
}

/** HTML date input value (YYYY-MM-DD) from a date-only Date. */
export function birthdayToInputValue(value: Date | null | undefined): string {
  if (!value) return "";
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, "0");
  const d = String(value.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Parse YYYY-MM-DD from a date picker into a UTC calendar Date for @db.Date.
 * Returns null for empty input; DomainError path for invalid.
 */
export function parseBirthdayInput(raw: string | null | undefined): Date | null | "invalid" {
  if (raw == null || raw.trim() === "") return null;
  const s = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "invalid";
  const [ys, ms, ds] = s.split("-");
  const y = Number(ys);
  const m = Number(ms);
  const d = Number(ds);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return "invalid";
  }
  return dt;
}
