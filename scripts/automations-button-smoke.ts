/**
 * Smoke test for BUTTON trigger (T-076).
 * Opt-in write test — never run from deploy smoke.
 *
 * Requires: DIRIGERA_IP, DIRIGERA_TOKEN, DIRIGERA_TEST_DEVICE_ID,
 * MCP_HOUSEHOLD_ID (or AUTOMATION_SMOKE_HOUSEHOLD_ID).
 * Optional: DIRIGERA_TEST_BUTTON_DEVICE_ID (defaults to Homebase …_1),
 *           DIRIGERA_TEST_BUTTON_IDENTITY (default singlePress).
 *
 * Usage:
 *   npm run automations:button-smoke -- --synthetic
 *   npm run automations:button-smoke -- --live
 *   npm run automations:button-smoke -- --live --listen-secs 120
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createDirigeraClient, type Event } from "dirigera";
import {
  clearButtonDebounceState,
  createAutomation,
  deleteAutomation,
  getAutomation,
  handleButtonPress,
  setAutomationEnabled,
} from "../src/domain/automations";
import { isDomainError } from "../src/domain/error";
import {
  listDirigeraLightOnStates,
  setDirigeraLightState,
  verifyDirigeraConnectivity,
} from "../src/domain/smarthome";

/** Default: Homebase Bilresa top button (button 1), Kantoor. */
const DEFAULT_BUTTON_ID = "f1833c72-58c7-46f1-978b-a56ad1fe26ae_1";
const DEFAULT_IDENTITY = "singlePress";

function loadDotEnv() {
  try {
    const content = readFileSync(resolve(process.cwd(), ".env"), "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // optional
  }
}

function parseArgs(argv: string[]) {
  const synthetic = argv.includes("--synthetic");
  const live = argv.includes("--live") || (!synthetic && !argv.includes("--help"));
  const listenSecsIdx = argv.indexOf("--listen-secs");
  let listenSecs = 120;
  if (listenSecsIdx !== -1) {
    const raw = Number(argv[listenSecsIdx + 1]);
    if (Number.isFinite(raw)) {
      listenSecs = Math.min(900, Math.max(30, Math.floor(raw)));
    }
  }
  return { synthetic: synthetic && !argv.includes("--live"), live, listenSecs };
}

async function readIsOn(deviceId: string): Promise<boolean | null> {
  const states = await listDirigeraLightOnStates();
  if (isDomainError(states)) return null;
  const v = states.get(deviceId);
  return typeof v === "boolean" ? v : null;
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

/** Wait for a matching remotePressEvent and return local receipt time. */
async function waitForRemotePress(
  buttonId: string,
  identity: string,
  listenSecs: number,
): Promise<Date | null> {
  const client = await createDirigeraClient({
    gatewayIP: process.env.DIRIGERA_IP!,
    accessToken: process.env.DIRIGERA_TOKEN!,
    rejectUnauthorized: false,
  });

  console.log(
    `Listening ${listenSecs}s for remotePressEvent id=${buttonId} identity=${identity}`,
  );
  console.log("Press the bound Bilresa button now.");

  let receivedAt: Date | null = null;
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    try {
      client.stopListeningForUpdates();
    } catch {
      // ignore
    }
  };

  await new Promise<void>((resolveListen) => {
    const timer = setTimeout(() => {
      stop();
      resolveListen();
    }, listenSecs * 1000);

    client.startListeningForUpdates((updateEvent: Event) => {
      if (updateEvent.type !== "remotePressEvent") return;
      const data = updateEvent.data as { id?: string; clickPattern?: string };
      console.log(
        `  saw remotePressEvent id=${data.id} clickPattern=${data.clickPattern}`,
      );
      if (data.id === buttonId && data.clickPattern === identity) {
        receivedAt = new Date();
        clearTimeout(timer);
        stop();
        resolveListen();
      }
    });
  });

  stop();
  return receivedAt;
}

async function main() {
  loadDotEnv();
  const args = parseArgs(process.argv.slice(2));

  if (process.argv.includes("--help")) {
    console.log(
      "Usage: npm run automations:button-smoke -- [--synthetic|--live] [--listen-secs N]",
    );
    process.exit(0);
  }

  if (!process.env.DIRIGERA_IP || !process.env.DIRIGERA_TOKEN) {
    console.error("FAIL: DIRIGERA_IP and DIRIGERA_TOKEN must be set");
    process.exit(1);
  }

  const testDeviceId = process.env.DIRIGERA_TEST_DEVICE_ID?.trim();
  if (!testDeviceId) {
    console.error("FAIL: DIRIGERA_TEST_DEVICE_ID must be set");
    process.exit(1);
  }

  const householdId =
    process.env.AUTOMATION_SMOKE_HOUSEHOLD_ID?.trim() ||
    process.env.MCP_HOUSEHOLD_ID?.trim();
  if (!householdId) {
    console.error(
      "FAIL: set MCP_HOUSEHOLD_ID or AUTOMATION_SMOKE_HOUSEHOLD_ID",
    );
    process.exit(1);
  }

  const buttonId =
    process.env.DIRIGERA_TEST_BUTTON_DEVICE_ID?.trim() || DEFAULT_BUTTON_ID;
  const identity =
    process.env.DIRIGERA_TEST_BUTTON_IDENTITY?.trim() || DEFAULT_IDENTITY;

  const connectivity = await verifyDirigeraConnectivity();
  if (isDomainError(connectivity)) {
    console.error(`FAIL: ${connectivity.message}`);
    process.exit(1);
  }
  console.log("OK: hub reachable");
  console.log(
    `Mode: ${args.live ? "live" : "synthetic"}; button=${buttonId}; identity=${identity}`,
  );

  // Ensure test light starts off.
  const setOff = await setDirigeraLightState(testDeviceId, false);
  if (isDomainError(setOff)) {
    console.error(`FAIL: turn off test light — ${setOff.message}`);
    process.exit(1);
  }
  await sleep(1500);
  const before = await readIsOn(testDeviceId);
  if (before !== false) {
    console.error(`FAIL: expected test light off, got isOn=${before}`);
    process.exit(1);
  }
  console.log("OK: test light off");

  clearButtonDebounceState();

  const created = await createAutomation(householdId, {
    name: `T-076 button smoke ${Date.now()}`,
    triggerKind: "BUTTON",
    buttonDirigeraDeviceId: buttonId,
    buttonIdentity: identity,
    on: true,
    targetDeviceIds: [testDeviceId],
  });
  if (isDomainError(created)) {
    console.error(`FAIL: create — ${created.message}`);
    process.exit(1);
  }
  console.log(`OK: created BUTTON rule ${created.id}`);

  let pressOk = false;
  try {
    if (args.live) {
      const receivedAt = await waitForRemotePress(
        buttonId,
        identity,
        args.listenSecs,
      );
      if (!receivedAt) {
        console.error(
          "FAIL: no matching remotePressEvent — press the Homebase Bilresa " +
            `(${identity}) while listening, or check controlMode=shortcut.`,
        );
        process.exit(1);
      }
      // WS path proven by waitForRemotePress; apply via same domain handler as worker.
      const summary = await handleButtonPress({
        deviceId: buttonId,
        identity,
        receivedAt,
      });
      console.log(
        `OK: live press handled matched=${summary.rulesMatched} applied=${summary.applied}`,
      );
      if (summary.applied < 1) {
        console.error("FAIL: press observed but automation did not apply");
        process.exit(1);
      }
      pressOk = true;
    } else {
      const summary = await handleButtonPress({
        deviceId: buttonId,
        identity,
        receivedAt: new Date(),
      });
      console.log(
        `OK: synthetic press matched=${summary.rulesMatched} applied=${summary.applied}`,
      );
      if (summary.applied < 1) {
        console.error("FAIL: synthetic press did not apply");
        process.exit(1);
      }
      pressOk = true;
    }

    await sleep(2000);
    const after = await readIsOn(testDeviceId);
    if (after !== true) {
      console.error(`FAIL: expected test light on after press, got isOn=${after}`);
      process.exit(1);
    }
    console.log("OK: test light on after BUTTON fire");

    const row = await getAutomation(householdId, created.id);
    if (isDomainError(row)) {
      console.error(`FAIL: reload — ${row.message}`);
      process.exit(1);
    }
    if (!row.lastRunAt) {
      console.error("FAIL: lastRunAt not set");
      process.exit(1);
    }
    console.log(`OK: lastRunAt=${row.lastRunAt.toISOString()} result=${row.lastRunResult}`);

    // Disable → further presses must not fire.
    const disabled = await setAutomationEnabled(householdId, created.id, false);
    if (isDomainError(disabled)) {
      console.error(`FAIL: disable — ${disabled.message}`);
      process.exit(1);
    }
    await setDirigeraLightState(testDeviceId, false);
    await sleep(1500);
    clearButtonDebounceState();
    const afterDisable = await handleButtonPress({
      deviceId: buttonId,
      identity,
      receivedAt: new Date(),
    });
    if (afterDisable.applied > 0 || afterDisable.claimed > 0) {
      console.error("FAIL: disabled rule still claimed/applied");
      process.exit(1);
    }
    const stillOff = await readIsOn(testDeviceId);
    if (stillOff !== false) {
      console.error("FAIL: light changed after disable");
      process.exit(1);
    }
    console.log("OK: disable stops further fires");
  } finally {
    const deleted = await deleteAutomation(householdId, created.id);
    if (isDomainError(deleted)) {
      console.error(`WARN: cleanup delete failed — ${deleted.message}`);
    } else {
      console.log("OK: deleted smoke rule");
    }
    await setDirigeraLightState(testDeviceId, false);
  }

  if (!pressOk) {
    process.exit(1);
  }
  console.log(
    args.live
      ? "PASS: live BUTTON path (press → light on; disable stops fires)"
      : "PASS: synthetic BUTTON path (domain only; run --live for WS acceptance)",
  );
}

main().catch((err) => {
  console.error("FAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
