/**
 * Pure unit checks for T-112 SSAP helpers — no live TV / WebSocket.
 * Run: npm run network:ssap-selftest
 */
import assert from "node:assert/strict";
import {
  WEBOS_HOME_APP_ID,
  inputLaunchAppId,
  resolveLaunchAppId,
  resolveSsapHost,
  switchInputId,
  waitUntilSsapReady,
  isTvInputId,
  isTvLaunchTarget,
  SSAP_WAKE_FLOOR_MS,
  SSAP_POLL_INTERVAL_MS,
  SSAP_READY_TIMEOUT_MS,
} from "../src/domain/network";
import { isDomainError } from "../src/domain/error";

function ok(label: string) {
  console.log(`ok — ${label}`);
}

async function main() {
  {
    const host = resolveSsapHost("192.168.1.50", "192.168.1.99");
    assert.equal(host, "192.168.1.50");
    ok("ssapHost preferred over lastSeenIp");
  }

  {
    const host = resolveSsapHost("  ", "192.168.1.99");
    assert.equal(host, "192.168.1.99");
    ok("falls back to lastSeenIp");
  }

  {
    const host = resolveSsapHost(null, null);
    assert.ok(isDomainError(host));
    assert.equal(host.reason, "ssap_no_host");
    ok("no host → DomainError");
  }

  {
    const home = resolveLaunchAppId("home", null);
    assert.equal(home, WEBOS_HOME_APP_ID);
    const missing = resolveLaunchAppId("jellyfin", null);
    assert.ok(isDomainError(missing));
    assert.equal(missing.reason, "jellyfin_app_id_unset");
    const jelly = resolveLaunchAppId("jellyfin", "com.jellyfin.app");
    assert.equal(jelly, "com.jellyfin.app");
    ok("launch targets");
  }

  {
    assert.equal(switchInputId("hdmi1"), "HDMI_1");
    assert.equal(switchInputId("live_tv"), "LIVE_TV");
    assert.equal(inputLaunchAppId("hdmi1"), "com.webos.app.hdmi1");
    assert.equal(inputLaunchAppId("live_tv"), "com.webos.app.livetv");
    ok("input maps");
  }

  {
    assert.equal(isTvLaunchTarget("home"), true);
    assert.equal(isTvLaunchTarget("netflix"), false);
    assert.equal(isTvInputId("hdmi1"), true);
    assert.equal(isTvInputId("hdmi9"), false);
    ok("type guards");
  }

  {
    assert.equal(SSAP_WAKE_FLOOR_MS, 8_000);
    assert.equal(SSAP_POLL_INTERVAL_MS, 2_000);
    assert.equal(SSAP_READY_TIMEOUT_MS, 90_000);
    ok("ready constants");
  }

  {
    let calls = 0;
    const ready = await waitUntilSsapReady(
      async () => {
        calls += 1;
        return calls >= 2;
      },
      { floorMs: 0, intervalMs: 1, timeoutMs: 200 },
    );
    assert.equal(ready, true);
    assert.ok(calls >= 2);
    ok("waitUntilSsapReady succeeds");
  }

  {
    const ready = await waitUntilSsapReady(async () => false, {
      floorMs: 0,
      intervalMs: 1,
      timeoutMs: 30,
    });
    assert.equal(ready, false);
    ok("waitUntilSsapReady timeout");
  }

  console.log("network:ssap-selftest passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
