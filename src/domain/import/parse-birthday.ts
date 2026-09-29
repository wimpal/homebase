/**
 * Parse Notion CSV birthday cells into a UTC calendar Date for @db.Date.
 * Accepts YYYY-MM-DD, DD-MM-YYYY, and date+time prefixes Notion sometimes exports.
 * Returns null for empty; "invalid" for unparseable values.
 */
export function parseImportBirthday(
  raw: string | null | undefined,
): Date | null | "invalid" {
  if (raw == null) return null;
  const s = raw.trim();
  if (!s) return null;

  // Strip trailing time portion: "2020-05-12T00:00:00.000Z" or "12-05-2020 00:00"
  const datePart = s.split(/[T\s]/)[0]?.trim() ?? "";
  if (!datePart) return "invalid";

  let y: number;
  let m: number;
  let d: number;

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
  if (iso) {
    y = Number(iso[1]);
    m = Number(iso[2]);
    d = Number(iso[3]);
  } else {
    const dmy = /^(\d{2})-(\d{2})-(\d{4})$/.exec(datePart);
    if (!dmy) return "invalid";
    d = Number(dmy[1]);
    m = Number(dmy[2]);
    y = Number(dmy[3]);
  }

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
