/**
 * Smoke test for SENSOR_EDGE automations (T-068).
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
  createAutomation,
  deleteAutomation,
  handleSensorRisingEdge,
  setAutomationEnabled,
} from "../src/domain/automations";
import { isDomainError } from "../src/domain/error";
import {
  listDirigeraEdgeSensors,
  listDirigeraLights,
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

  // Ensure test light is off so rising edge should apply.
  const off = await setDirigeraLightState(testDeviceId, false);
  if (!off.success) {
    console.error(`FAIL: could not turn test light off — ${off.error}`);
    process.exit(1);
  }
  console.log("OK: test light off");

  let automationId: string | undefined;
  let failed = false;
  try {
    const created = await createAutomation(householdId, {
      name: `T-068 smoke ${new Date().toISOString()}`,
      triggerKind: "SENSOR_EDGE",
      sensorDirigeraDeviceId: sensor.id,
      sensorEdgeAttribute: sensor.edgeAttribute,
      on: true,
      targetDeviceIds: [testDeviceId],
    });
    if (isDomainError(created)) {
      console.error(`FAIL: create — ${created.message}`);
      failed = true;
      return;
    }
    automationId = created.id;
    console.log(`OK: created SENSOR_EDGE automation ${automationId}`);

    const first = await handleSensorRisingEdge({
      sensorId: sensor.id,
      attribute: sensor.edgeAttribute,
      receivedAt: new Date(),
    });
    console.log(
      `OK: first edge matched=${first.rulesMatched} claimed=${first.claimed} applied=${first.applied} skipped=${first.skipped} failed=${first.failed}`,
    );
    if (first.applied < 1 && first.skipped < 1) {
      console.error("FAIL: expected apply or skip after claim");
      failed = true;
      return;
    }

    const lights = await listDirigeraLights();
    if (!isDomainError(lights)) {
      const lamp = lights.find((l) => l.id === testDeviceId);
      console.log(
        `OK: test light isOn=${lamp?.isOn} (expect true if applied)`,
      );
    }

    const second = await handleSensorRisingEdge({
      sensorId: sensor.id,
      attribute: sensor.edgeAttribute,
      receivedAt: new Date(),
    });
    console.log(
      `OK: second edge (cooldown) claimed=${second.claimed} (expect 0)`,
    );
    if (second.claimed !== 0) {
      console.error("FAIL: cooldown did not block second claim");
      failed = true;
      return;
    }

    await setAutomationEnabled(householdId, automationId, false);
    const third = await handleSensorRisingEdge({
      sensorId: sensor.id,
      attribute: sensor.edgeAttribute,
      receivedAt: new Date(Date.now() + 120_000),
    });
    if (third.rulesMatched !== 0) {
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
  console.log("All T-068 sensor automation smoke checks passed");
}

main().catch((err) => {
  console.error("FAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
