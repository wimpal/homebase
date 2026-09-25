/**
 * T-101 self-test: WoL target list (unicast lastSeenIp + broadcast).
 * Run: npx tsx scripts/network-wol-selftest.ts
 */
import {
  parseIpv4,
  resolveWolBroadcast,
  resolveWolTargets,
} from "../src/domain/network/wol/packet";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const prevBroadcast = process.env.HOME_NETWORK_WOL_BROADCAST;
const prevCidr = process.env.HOME_NETWORK_SCAN_CIDR;

try {
  delete process.env.HOME_NETWORK_WOL_BROADCAST;
  process.env.HOME_NETWORK_SCAN_CIDR = "192.168.1.0/24";

  assert(parseIpv4("192.168.1.93") === "192.168.1.93", "valid ipv4");
  assert(parseIpv4(" 10.0.0.1 ") === "10.0.0.1", "trim ipv4");
  assert(parseIpv4("999.1.1.1") === null, "octet >255");
  assert(parseIpv4("not-an-ip") === null, "garbage");
  assert(parseIpv4("") === null, "empty");
  assert(parseIpv4(null) === null, "null");

  assert(resolveWolBroadcast() === "192.168.1.255", "cidr broadcast");

  {
    const t = resolveWolTargets(["192.168.1.93"]);
    assert(
      t.length === 2 && t[0] === "192.168.1.93" && t[1] === "192.168.1.255",
      `unicast then broadcast got ${JSON.stringify(t)}`,
    );
  }
  {
    const t = resolveWolTargets(["bad", "192.168.1.93", null, "192.168.1.93"]);
    assert(
      t.length === 2 && t[0] === "192.168.1.93",
      `invalid ignored + dedupe got ${JSON.stringify(t)}`,
    );
  }
  {
    const t = resolveWolTargets(["192.168.1.255"]);
    assert(
      t.length === 1 && t[0] === "192.168.1.255",
      `unicast same as broadcast deduped got ${JSON.stringify(t)}`,
    );
  }
  {
    const t = resolveWolTargets([]);
    assert(
      t.length === 1 && t[0] === "192.168.1.255",
      `broadcast only got ${JSON.stringify(t)}`,
    );
  }

  process.env.HOME_NETWORK_WOL_BROADCAST = "192.168.1.255";
  assert(resolveWolBroadcast() === "192.168.1.255", "explicit broadcast");

  console.log("network-wol-selftest: ok");
} finally {
  if (prevBroadcast === undefined) delete process.env.HOME_NETWORK_WOL_BROADCAST;
  else process.env.HOME_NETWORK_WOL_BROADCAST = prevBroadcast;
  if (prevCidr === undefined) delete process.env.HOME_NETWORK_SCAN_CIDR;
  else process.env.HOME_NETWORK_SCAN_CIDR = prevCidr;
}
