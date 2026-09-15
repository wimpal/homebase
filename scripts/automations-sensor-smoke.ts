/**
 * Smoke test for SENSOR_EDGE automations (T-068 + toggle enter/leave).
 * Opt-in write test — never run from deploy smoke.
 *
 * Requires: DIRIGERA_IP, DIRIGERA_TOKEN, DIRIGERA_TEST_DEVICE_ID,
 * MCP_HOUSEHOLD_ID (or AUTOMATION_SMOKE_HOUSEHOLD_ID).
 * Optional: DIRIGERA_TEST_SENSOR_ID (defaults to first openCloseSensor).
 *
 * Usage:
 *   npm run automations:sensor-smoke
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  SENSOR_COOLDOWN_MS,
  SENSOR_DEBOUNCE_MS,
  clearSensorDebounceState,
  createAutomation,
  deleteAutomation,
  handleSensorEdge,
  handleSensorRisingEdge,
  setAutomationEnabled,
} from "../src/domain/automations";
import { isDomainError } from "../src/domain/error";
import {
  listDirigeraEdgeSensors,
  listDirigeraLightOnStates,
  setDirigeraLightState,
  verifyDirigeraConnectivity,
} from "../src/domain/smarthome";

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

async function readIsOn(deviceId: string): Promise<boolean | null> {
  const states = await listDirigeraLightOnStates();
  if (isDomainError(states)) return null;
  const v = states.get(deviceId);
  return typeof v === "boolean" ? v : null;
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  loadDotEnv();

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

  const connectivity = await verifyDirigeraConnectivity();
  if (isDomainError(connectivity)) {
    console.error(`FAIL: ${connectivity.message}`);
    process.exit(1);
  }
  console.log("OK: hub reachable");

  const sensors = await listDirigeraEdgeSensors();
  if (isDomainError(sensors)) {
    console.error(`FAIL: sensors — ${sensors.message}`);
    process.exit(1);
  }
  const preferred = process.env.DIRIGERA_TEST_SENSOR_ID?.trim();
  const sensor =
    (preferred ? sensors.find((s) => s.id === preferred) : undefined) ??
    sensors.find((s) => s.deviceType === "openCloseSensor") ??
    sensors[0];
  if (!sensor) {
    console.error("FAIL: no edge sensors on hub");
    process.exit(1);
  }
  console.log(`OK: using sensor ${sensor.name} (${sensor.edgeAttribute})`);

  const off = await setDirigeraLightState(testDeviceId, false);
  if (!off.success) {
    console.error(`FAIL: could not turn test light off — ${off.error}`);
    process.exit(1);
  }
  console.log("OK: test light off");

  let automationId: string | undefined;
  let failed = false;
  clearSensorDebounceState();

  try {
    const created = await createAutomation(householdId, {
      name: `toggle smoke ${new Date().toISOString()}`,
      triggerKind: "SENSOR_EDGE",
      sensorDirigeraDeviceId: sensor.id,
      sensorEdgeAttribute: sensor.edgeAttribute,
      sensorEdgePolarity: "rising",
      on: true,
      toggle: true,
      targetDeviceIds: [testDeviceId],
    });
    if (isDomainError(created)) {
      console.error(`FAIL: create toggle — ${created.message}`);
      failed = true;
      return;
    }
    automationId = created.id;
    console.log(`OK: created toggle SENSOR_EDGE automation ${automationId}`);

    const t0 = Date.now();
    const first = await handleSensorRisingEdge({
      sensorId: sensor.id,
      attribute: sensor.edgeAttribute,
      receivedAt: new Date(t0),
    });
    console.log(
      `OK: first open matched=${first.rulesMatched} claimed=${first.claimed} applied=${first.applied}`,
    );
    if (first.applied < 1) {
      console.error("FAIL: expected apply on first open (off→on)");
      failed = true;
      return;
    }
    const afterOpen = await readIsOn(testDeviceId);
    if (afterOpen !== true) {
      console.error(`FAIL: expected light on after first open, got ${afterOpen}`);
      failed = true;
      return;
    }
    console.log("OK: open → on");

    // Falling edge must not match a rising-only toggle rule.
    await sleep(SENSOR_DEBOUNCE_MS + 50);
    const close = await handleSensorEdge({
      sensorId: sensor.id,
      attribute: sensor.edgeAttribute,
      polarity: "falling",
      receivedAt: new Date(t0 + SENSOR_DEBOUNCE_MS + 100),
    });
    if (close.rulesMatched !== 0) {
      console.error("FAIL: falling edge matched rising toggle rule");
      failed = true;
      return;
    }
    const afterClose = await readIsOn(testDeviceId);
    if (afterClose !== true) {
      console.error(`FAIL: light changed on close, isOn=${afterClose}`);
      failed = true;
      return;
    }
    console.log("OK: close → unchanged (no rule)");

    // Second open after cooldown → off
    const afterCooldown = t0 + SENSOR_COOLDOWN_MS + 500;
    clearSensorDebounceState();
    const second = await handleSensorRisingEdge({
      sensorId: sensor.id,
      attribute: sensor.edgeAttribute,
      receivedAt: new Date(afterCooldown),
    });
    console.log(
      `OK: second open claimed=${second.claimed} applied=${second.applied}`,
    );
    if (second.applied < 1) {
      console.error("FAIL: expected apply on second open (on→off)");
      failed = true;
      return;
    }
    const afterLeave = await readIsOn(testDeviceId);
    if (afterLeave !== false) {
      console.error(
        `FAIL: expected light off after second open, got ${afterLeave}`,
      );
      failed = true;
      return;
    }
    console.log("OK: open again → off");

    await setAutomationEnabled(householdId, automationId, false);
    const disabled = await handleSensorRisingEdge({
      sensorId: sensor.id,
      attribute: sensor.edgeAttribute,
      receivedAt: new Date(afterCooldown + SENSOR_COOLDOWN_MS + 500),
    });
    if (disabled.rulesMatched !== 0) {
      console.error("FAIL: disabled rule still matched");
      failed = true;
      return;
    }
    console.log("OK: disabled rule does not match");
  } finally {
    if (automationId) {
      const deleted = await deleteAutomation(householdId, automationId);
      if (isDomainError(deleted)) {
        console.error(`WARN: cleanup delete — ${deleted.message}`);
      } else {
        console.log("OK: cleaned up automation");
      }
    }
  }

  if (failed) process.exit(1);
  console.log("All sensor toggle smoke checks passed");
}

main().catch((err) => {
  console.error("FAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
