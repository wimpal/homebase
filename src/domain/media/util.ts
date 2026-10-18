export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Python int(x) semantics for Jellyfin numbers: missing or non-finite → null. */
export function toInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

const TZ_SUFFIX_RE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

/** Mimir parse_jellyfin_datetime: any Jellyfin timestamp → UTC `YYYY-MM-DDTHH:MM:SSZ`, else null. */
export function normalizeJellyfinDate(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  let text = String(raw).trim();
  if (!text) return null;
  text = text.replace(/(\.\d{3})\d+/, "$1"); // Jellyfin sends 7 fractional digits
  if (!TZ_SUFFIX_RE.test(text)) text = `${text}Z`; // no zone = UTC, as Mimir
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().replace(/\.\d{3}Z$/, "Z");
}
