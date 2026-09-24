import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { normalizeMacAddress } from "../identity";
import { isDomainError } from "@/domain/error";

const execFileAsync = promisify(execFile);

export type ProbeResult = {
  ip: string;
  alive: boolean;
  mac?: string;
  hostname?: string;
};

/** ICMP ping one host (1 packet, ~1s timeout). */
export async function pingHost(
  ip: string,
  signal?: AbortSignal,
): Promise<boolean> {
  if (signal?.aborted) return false;
  const isWin = process.platform === "win32";
  const args = isWin
    ? ["-n", "1", "-w", "800", ip]
    : ["-c", "1", "-W", "1", ip];
  try {
    const child = execFileAsync("ping", args, {
      timeout: 2000,
      windowsHide: true,
    });
    if (signal) {
      const onAbort = () => {
        // best-effort — Node kills via timeout / ignore
      };
      signal.addEventListener("abort", onAbort, { once: true });
      try {
        await child;
      } finally {
        signal.removeEventListener("abort", onAbort);
      }
    } else {
      await child;
    }
    return true;
  } catch {
    return false;
  }
}

/** Read ARP / neighbor table → ip → mac map. */
export async function readArpTable(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    if (process.platform === "win32") {
      const { stdout } = await execFileAsync("arp", ["-a"], {
        timeout: 5000,
        windowsHide: true,
      });
      for (const line of stdout.split(/\r?\n/)) {
        const m = /(\d+\.\d+\.\d+\.\d+)\s+([0-9a-fA-F\-]{11,17})/.exec(line);
        if (!m) continue;
        const mac = normalizeMacAddress(m[2].replace(/-/g, ":"));
        if (mac && !isDomainError(mac)) map.set(m[1], mac);
      }
      return map;
    }

    // Linux: /proc/net/arp
    try {
      const text = await readFile("/proc/net/arp", "utf8");
      for (const line of text.split("\n").slice(1)) {
        const cols = line.trim().split(/\s+/);
        if (cols.length < 4) continue;
        const ip = cols[0];
        const macRaw = cols[3];
        if (!macRaw || macRaw === "00:00:00:00:00:00") continue;
        const mac = normalizeMacAddress(macRaw);
        if (mac && !isDomainError(mac)) map.set(ip, mac);
      }
    } catch {
      // fall through to ip neigh
    }

    try {
      const { stdout } = await execFileAsync("ip", ["neigh", "show"], {
        timeout: 5000,
      });
      for (const line of stdout.split("\n")) {
        const m =
          /^(\d+\.\d+\.\d+\.\d+)\s+.*\slladdr\s+([0-9a-fA-F:]+)/i.exec(line);
        if (!m) continue;
        const mac = normalizeMacAddress(m[2]);
        if (mac && !isDomainError(mac)) map.set(m[1], mac);
      }
    } catch {
      // optional
    }
  } catch {
    // empty map
  }
  return map;
}

/** Best-effort reverse DNS (short timeout). */
export async function reverseHostname(ip: string): Promise<string | undefined> {
  try {
    const dns = await import("node:dns/promises");
    const names = await Promise.race([
      dns.reverse(ip),
      new Promise<string[]>((_, rej) =>
        setTimeout(() => rej(new Error("timeout")), 500),
      ),
    ]);
    const name = names[0]?.replace(/\.$/, "");
    return name || undefined;
  } catch {
    return undefined;
  }
}
