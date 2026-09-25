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
  clearSsapTransportPreferences,
  ssapEndpointCandidates,
  isSsapPairingPromptAck,
  normalizeSsapAppCatalog,
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
    clearSsapTransportPreferences();
    const first = ssapEndpointCandidates("192.168.1.106");
    assert.equal(first[0]?.url, "wss://192.168.1.106:3001");
    assert.equal(first[1]?.url, "ws://192.168.1.106:3000");
    ok("default endpoint order wss:3001 then ws:3000");
  }

  {
    assert.equal(
      isSsapPairingPromptAck({
        type: "response",
        payload: { pairingType: "PROMPT", returnValue: true },
      }),
      true,
    );
    assert.equal(
      isSsapPairingPromptAck({
        type: "response",
        payload: { returnValue: true },
      }),
      false,
      "successful launch ack must not be treated as pairing prompt",
    );
    assert.equal(
      isSsapPairingPromptAck({
        type: "registered",
        payload: { "client-key": "x" },
      }),
      false,
    );
    ok("pairing prompt ack vs launch success");
  }

  {
    const fromLaunch = normalizeSsapAppCatalog({
      launchPoints: [
        { id: "org.jellyfin.webos", title: "Jellyfin" },
        { id: "com.webos.app.home", name: "Home" },
        { id: "org.jellyfin.webos", title: "Jellyfin dup" },
      ],
    });
    assert.equal(fromLaunch.length, 2);
    assert.equal(fromLaunch[0]?.id, "com.webos.app.home");
    assert.equal(fromLaunch[1]?.id, "org.jellyfin.webos");
    assert.equal(fromLaunch[1]?.title, "Jellyfin");

    const fromApps = normalizeSsapAppCatalog({
      apps: [{ appId: "com.example.app", title: "Example" }],
    });
    assert.equal(fromApps.length, 1);
    assert.equal(fromApps[0]?.id, "com.example.app");

    assert.deepEqual(normalizeSsapAppCatalog({}), []);
    ok("normalizeSsapAppCatalog launchPoints + apps");
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
