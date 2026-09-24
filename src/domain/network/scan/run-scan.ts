import { prisma } from "@/core/db";
import { DomainError } from "@/domain/error";
import { assertHomeNetworkEnabled } from "../module-gate";
import { matchCandidate } from "../match";
import { parseScanCidr } from "./cidr";
import {
  appendCandidate,
  canStartScan,
  createScanJobId,
  finishJob,
  getJobAbort,
  registerScanJob,
  updateJobProgress,
  type ScanJobSnapshot,
} from "./job-store";
import { pingHost, readArpTable, reverseHostname } from "./probe";

const WALL_MS = 25_000;
const CONCURRENCY = 32;

function scanCidrFromEnv(): string | undefined {
  return process.env.HOME_NETWORK_SCAN_CIDR?.trim() || undefined;
}

/**
 * Start an in-process LAN scan. Returns job snapshot immediately; work runs async.
 */
export async function startNetworkScan(
  householdId: string,
): Promise<ScanJobSnapshot | DomainError> {
  const gated = await assertHomeNetworkEnabled(householdId);
  if (gated) return gated;

  const parsed = parseScanCidr(scanCidrFromEnv());
  if (parsed instanceof DomainError) return parsed;

  const gate = canStartScan(householdId);
  if (!gate.ok) {
    return DomainError.invalidInput(gate.reason, "scan_busy");
  }

  const jobId = createScanJobId();
  const job = registerScanJob(householdId, jobId, parsed.hosts.length);

  void runScan(householdId, jobId, parsed.hosts, parsed.gateway).catch(
    (err) => {
      finishJob(
        jobId,
        "failed",
        err instanceof Error ? err.message : "Scan failed.",
      );
    },
  );

  return {
    jobId: job.jobId,
    householdId: job.householdId,
    state: job.state,
    progress: { ...job.progress },
    candidates: [],
    startedAt: job.startedAt,
  };
}

async function runScan(
  householdId: string,
  jobId: string,
  hosts: string[],
  gateway: string,
): Promise<void> {
  const abort = getJobAbort(jobId);
  if (!abort) return;
  const signal = abort.signal;
  const deadline = Date.now() + WALL_MS;

  const devices = await prisma.networkDevice.findMany({
    where: { householdId },
    select: {
      id: true,
      name: true,
      retiredAt: true,
      macAddress: true,
      lastSeenIp: true,
      lastSeenHostname: true,
    },
  });

  let done = 0;
  const aliveIps: string[] = [];
  const queue = [...hosts];

  async function worker() {
    while (queue.length > 0) {
      if (signal.aborted || Date.now() > deadline) return;
      const ip = queue.shift();
      if (!ip) return;
      const alive = await pingHost(ip, signal);
      done += 1;
      updateJobProgress(jobId, done);
      if (alive) aliveIps.push(ip);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, hosts.length) }, () =>
      worker(),
    ),
  );

  if (signal.aborted) {
    finishJob(jobId, "cancelled");
    return;
  }

  let gatewayAlive = aliveIps.includes(gateway);
  if (!gatewayAlive) {
    gatewayAlive = await pingHost(gateway, signal);
  }

  if (aliveIps.length === 0 && !gatewayAlive) {
    finishJob(
      jobId,
      "failed",
      "Network unreachable from this container. Check HOME_NETWORK_SCAN_CIDR and Docker LAN access (see docs/home-network-scan.md).",
    );
    return;
  }

  const arp = await readArpTable();
  for (const ip of aliveIps) {
    if (signal.aborted) {
      finishJob(jobId, "cancelled");
      return;
    }
    const hostname = await reverseHostname(ip);
    const mac = arp.get(ip);
    const match = matchCandidate({ ip, mac, hostname }, devices);
    appendCandidate(jobId, {
      ip,
      mac,
      hostname,
      status: match.status,
      device_id: match.deviceId,
      device_name: match.deviceName,
      match_reason: match.matchReason,
    });
  }

  if (signal.aborted) {
    finishJob(jobId, "cancelled");
    return;
  }
  finishJob(jobId, "completed");
}
