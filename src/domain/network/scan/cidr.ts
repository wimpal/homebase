import { DomainError } from "@/domain/error";

export type ParsedCidr = {
  network: number;
  prefix: number;
  hosts: string[];
  /** First usable host (.1) used as gateway probe. */
  gateway: string;
};

function ipToInt(ip: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip.trim());
  if (!m) return null;
  const octets = m.slice(1).map(Number);
  if (octets.some((n) => n > 255)) return null;
  return (
    ((octets[0] << 24) >>> 0) +
    ((octets[1] << 16) >>> 0) +
    ((octets[2] << 8) >>> 0) +
    (octets[3] >>> 0)
  );
}

function intToIp(n: number): string {
  return [
    (n >>> 24) & 255,
    (n >>> 16) & 255,
    (n >>> 8) & 255,
    n & 255,
  ].join(".");
}

function isPrivateRfc1918(ipInt: number): boolean {
  const a = (ipInt >>> 24) & 255;
  const b = (ipInt >>> 16) & 255;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

/**
 * Parse HOME_NETWORK_SCAN_CIDR. RFC1918 only, prefix 24–30 (max 254 hosts).
 */
export function parseScanCidr(
  raw: string | undefined | null,
): ParsedCidr | DomainError {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) {
    return DomainError.invalidInput(
      "HOME_NETWORK_SCAN_CIDR is not set. Set a private /24 (e.g. 192.168.1.0/24).",
      "scan_cidr_missing",
    );
  }
  const parts = trimmed.split("/");
  if (parts.length !== 2) {
    return DomainError.invalidInput(
      "Invalid CIDR. Use e.g. 192.168.1.0/24.",
      "scan_cidr_invalid",
    );
  }
  const base = ipToInt(parts[0]);
  const prefix = Number(parts[1]);
  if (base == null || !Number.isInteger(prefix) || prefix < 24 || prefix > 30) {
    return DomainError.invalidInput(
      "CIDR must be a private network with prefix 24–30.",
      "scan_cidr_invalid",
    );
  }
  if (!isPrivateRfc1918(base)) {
    return DomainError.invalidInput(
      "CIDR must be RFC1918 private (10/8, 172.16/12, 192.168/16).",
      "scan_cidr_not_private",
    );
  }

  const hostBits = 32 - prefix;
  const size = 1 << hostBits;
  if (size - 2 > 254) {
    return DomainError.invalidInput(
      "CIDR too large (max 254 hosts).",
      "scan_cidr_too_large",
    );
  }

  const mask = size === 0 ? 0 : (~(size - 1)) >>> 0;
  const network = (base & mask) >>> 0;
  const hosts: string[] = [];
  for (let i = 1; i < size - 1; i++) {
    hosts.push(intToIp(network + i));
  }
  const gateway = intToIp(network + 1);

  return { network, prefix, hosts, gateway };
}
