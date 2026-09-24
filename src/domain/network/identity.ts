import { DomainError } from "@/domain/error";

/** Normalize to lowercase colon-separated hex, or DomainError. Empty → null. */
export function normalizeMacAddress(
  raw: string | null | undefined,
): string | null | DomainError {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Only hex + common separators — rejects smuggled text that still yields 12 hex digits.
  if (!/^[0-9a-fA-F:.\-\s]+$/.test(trimmed)) {
    return DomainError.invalidInput("Invalid MAC address.", "invalid_mac");
  }
  const hex = trimmed.toLowerCase().replace(/[^0-9a-f]/g, "");
  if (hex.length !== 12) {
    return DomainError.invalidInput("Invalid MAC address.", "invalid_mac");
  }
  const parts: string[] = [];
  for (let i = 0; i < 12; i += 2) parts.push(hex.slice(i, i + 2));
  const normalized = parts.join(":");
  if (normalized === "00:00:00:00:00:00" || normalized === "ff:ff:ff:ff:ff:ff") {
    return DomainError.invalidInput("Invalid MAC address.", "invalid_mac");
  }
  const firstOctet = parseInt(parts[0], 16);
  if ((firstOctet & 0x01) !== 0) {
    // Multicast / group address — not a unicast NIC for WoL.
    return DomainError.invalidInput("Invalid MAC address.", "invalid_mac");
  }
  return normalized;
}

export function normalizeHostname(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  const t = raw.trim().slice(0, 200);
  return t || null;
}

export function normalizeIp(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = raw.trim();
  if (!t) return null;
  // Basic IPv4 check
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(t);
  if (!m) return null;
  const octets = m.slice(1).map(Number);
  if (octets.some((n) => n > 255)) return null;
  return octets.join(".");
}
