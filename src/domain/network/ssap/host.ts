import { DomainError } from "@/domain/error";
import { parseIpv4 } from "../wol/packet";

/**
 * Prefer ADMIN-stored ssapHost; fall back to lastSeenIp.
 * Host may be hostname or IPv4.
 */
export function resolveSsapHost(
  ssapHost: string | null | undefined,
  lastSeenIp: string | null | undefined,
): string | DomainError {
  const preferred = (ssapHost ?? "").trim();
  if (preferred) {
    const asIp = parseIpv4(preferred);
    return asIp ?? preferred;
  }
  const ip = parseIpv4(lastSeenIp);
  if (ip) return ip;
  return DomainError.unavailable(
    "No usable host for TV control. Set SSAP host or wait for a LAN scan.",
    "ssap_no_host",
  );
}
