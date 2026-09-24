/**
 * T-110 self-test: CIDR parse, MAC normalize, match matrix, job cooldown.
 * Run: npx tsx scripts/network-scan-selftest.ts
 */
import { isDomainError } from "../src/domain/error";
import { normalizeMacAddress } from "../src/domain/network/identity";
import { matchCandidate } from "../src/domain/network/match";
import { parseScanCidr } from "../src/domain/network/scan/cidr";
import {
  _resetScanJobsForTests,
  canStartScan,
  cancelScanJob,
  createScanJobId,
  finishJob,
  getScanJob,
  registerScanJob,
} from "../src/domain/network/scan/job-store";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

// CIDR
{
  const ok = parseScanCidr("192.168.1.0/24");
  assert(!(ok instanceof Error) && !isDomainError(ok), "valid /24");
  assert(ok.hosts.length === 254, `expected 254 hosts got ${ok.hosts.length}`);
  assert(ok.gateway === "192.168.1.1", "gateway");

  assert(isDomainError(parseScanCidr("")), "missing cidr");
  assert(isDomainError(parseScanCidr("8.8.8.0/24")), "public rejected");
  assert(isDomainError(parseScanCidr("192.168.1.0/16")), "too large prefix");
}

// MAC
{
  const m = normalizeMacAddress("AA-BB-CC-DD-EE-FF");
  assert(!isDomainError(m) && m === "aa:bb:cc:dd:ee:ff", "mac normalize");
  assert(isDomainError(normalizeMacAddress("bad")), "bad mac");
  assert(normalizeMacAddress("") === null, "empty mac");
}

// Match
{
  const devices = [
    {
      id: "1",
      name: "NAS",
      retiredAt: null,
      macAddress: "aa:bb:cc:dd:ee:ff",
      lastSeenIp: "192.168.1.10",
      lastSeenHostname: "nas.local",
    },
    {
      id: "2",
      name: "Old",
      retiredAt: new Date(),
      macAddress: "11:22:33:44:55:66",
      lastSeenIp: "192.168.1.20",
      lastSeenHostname: null,
    },
  ];
  assert(
    matchCandidate({ ip: "192.168.1.10", mac: "aa:bb:cc:dd:ee:ff" }, devices)
      .status === "enrolled",
    "mac enrolled",
  );
  assert(
    matchCandidate({ ip: "x", mac: "11:22:33:44:55:66" }, devices).status ===
      "retired",
    "mac retired",
  );
  assert(
    matchCandidate(
      { ip: "192.168.1.10", hostname: "nas.local" },
      devices,
    ).status === "enrolled",
    "ip+host enrolled",
  );
  assert(
    matchCandidate({ ip: "192.168.1.10" }, devices).status === "ambiguous",
    "ip only ambiguous",
  );
  assert(
    matchCandidate({ ip: "192.168.1.99" }, devices).status === "new",
    "new",
  );
}

// Job store — no DB
{
  _resetScanJobsForTests();
  const hid = "hh1";
  assert(canStartScan(hid).ok, "can start");
  const id = createScanJobId();
  registerScanJob(hid, id, 10);
  assert(!canStartScan(hid).ok, "busy while running");
  const snap = getScanJob(id, hid);
  assert(snap?.state === "running", "running");
  cancelScanJob(id, hid);
  assert(getScanJob(id, hid)?.state === "cancelled", "cancelled");
  // cooldown after cancel
  assert(!canStartScan(hid).ok, "cooldown");
  _resetScanJobsForTests();
  const id2 = createScanJobId();
  registerScanJob(hid, id2, 1);
  finishJob(id2, "completed");
  assert(getScanJob(id2, hid)?.state === "completed", "completed");
}

console.log("network-scan-selftest OK");
