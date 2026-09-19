/**
 * Smoke test for SENSOR_EDGE leave-session Toggle (T-070).
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
  SENSOR_DEBOUNCE_MS,
  clearSensorDebounceState,
  createAutomation,
  deleteAutomation,
  getAutomation,
  getLocalScheduleParts,
  handleSensorEdge,
  setAutomationEnabled,
} from "../src/domain/automations";
import { AUTOMATION_TIMEZONE_V1 } from "../src/domain/automations/types";
import { isDomainError } from "../src/domain/error";
import {
  listDirigeraEdgeSensors,
  listDirigeraLightOnStates,
  setDirigeraLightState,
  verifyDirigeraConnectivity,
} from "../src/domain/smarthome";

/** Find a UTC instant whose local HH:MM in `tz` matches (within ±14h of now). */
function utcInstantForLocal(hhmm: string, tz: string = AUTOMATION_TIMEZONE_V1): Date {
  const start = Date.now() - 14 * 3600_000;
  for (let t = start; t < start + 28 * 3600_000; t += 60_000) {
    const d = new Date(t);
    if (getLocalScheduleParts(d, tz).timeLocal === hhmm) return d;
  }
  throw new Error(`Could not find UTC instant for local ${hhmm} in ${tz}`);
}

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
      name: `leave-session smoke ${new Date().toISOString()}`,
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
    console.log(`OK: created leave-session Toggle ${automationId}`);

    let t = Date.now();

    // 1) Enter open → on + occupied
    const enter = await handleSensorEdge({
      sensorId: sensor.id,
      attribute: sensor.edgeAttribute,
      polarity: "rising",
      receivedAt: new Date(t),
    });
    if (enter.applied < 1) {
      console.error("FAIL: enter open expected apply");
      failed = true;
      return;
    }
    let row = await getAutomation(householdId, automationId);
    if (isDomainError(row) || row.toggleSession !== "occupied") {
      console.error(
        `FAIL: expected occupied, got ${isDomainError(row) ? row.message : row.toggleSession}`,
      );
      failed = true;
      return;
    }
    if ((await readIsOn(testDeviceId)) !== true) {
      console.error("FAIL: light should be on after enter");
      failed = true;
      return;
    }
    console.log("OK: enter Open → on + occupied");

    // 2) Sit close → unchanged
    await sleep(SENSOR_DEBOUNCE_MS + 50);
    t += SENSOR_DEBOUNCE_MS + 100;
    clearSensorDebounceState();
    const sit = await handleSensorEdge({
      sensorId: sensor.id,
      attribute: sensor.edgeAttribute,
      polarity: "falling",
      receivedAt: new Date(t),
    });
    if (sit.applied !== 0) {
      console.error("FAIL: sit close must not write lights");
      failed = true;
      return;
    }
    row = await getAutomation(householdId, automationId);
    if (isDomainError(row) || row.toggleSession !== "occupied") {
      console.error("FAIL: session should stay occupied after sit close");
      failed = true;
      return;
    }
    if ((await readIsOn(testDeviceId)) !== true) {
      console.error("FAIL: light should stay on after sit close");
      failed = true;
      return;
    }
    console.log("OK: sit Close → stay on + occupied");

    // 3) Leave open → leaving, light stays
    await sleep(SENSOR_DEBOUNCE_MS + 50);
    t += SENSOR_DEBOUNCE_MS + 100;
    clearSensorDebounceState();
    const leaveOpen = await handleSensorEdge({
      sensorId: sensor.id,
      attribute: sensor.edgeAttribute,
      polarity: "rising",
      receivedAt: new Date(t),
    });
    if (leaveOpen.applied !== 0) {
      console.error("FAIL: leave open must not write lights");
      failed = true;
      return;
    }
    row = await getAutomation(householdId, automationId);
    if (isDomainError(row) || row.toggleSession !== "leaving") {
      console.error(
        `FAIL: expected leaving, got ${isDomainError(row) ? row.message : row.toggleSession}`,
      );
      failed = true;
      return;
    }
    if ((await readIsOn(testDeviceId)) !== true) {
      console.error("FAIL: light should stay on while leaving");
      failed = true;
      return;
    }
    console.log("OK: leave Open → leaving, light on");

    // 4) Leave close soon after enter — must NOT be blocked by enter cooldown
    t += SENSOR_DEBOUNCE_MS + 100;
    clearSensorDebounceState();
    const leaveClose = await handleSensorEdge({
      sensorId: sensor.id,
      attribute: sensor.edgeAttribute,
      polarity: "falling",
      receivedAt: new Date(t),
    });
    if (leaveClose.applied < 1) {
      console.error("FAIL: leave close expected apply off (no enter-cooldown block)");
      failed = true;
      return;
    }
    row = await getAutomation(householdId, automationId);
    if (isDomainError(row) || row.toggleSession !== "idle") {
      console.error(
        `FAIL: expected idle, got ${isDomainError(row) ? row.message : row.toggleSession}`,
      );
      failed = true;
      return;
    }
    if ((await readIsOn(testDeviceId)) !== false) {
      console.error("FAIL: light should be off after leave close");
      failed = true;
      return;
    }
    console.log("OK: leave Close → off + idle");

    await setAutomationEnabled(householdId, automationId, false);
    row = await getAutomation(householdId, automationId);
    if (!isDomainError(row) && row.toggleSession !== "idle") {
      console.error("FAIL: disable should reset session to idle");
      failed = true;
      return;
    }
    console.log("OK: disable resets session");
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

  // Active hours: enter skipped outside window; leave-off still works outside.
  let activeId: string | undefined;
  clearSensorDebounceState();
  try {
    const off2 = await setDirigeraLightState(testDeviceId, false);
    if (!off2.success) {
      console.error(`FAIL: reset light off — ${off2.error}`);
      process.exit(1);
    }

    const created = await createAutomation(householdId, {
      name: `active-hours smoke ${new Date().toISOString()}`,
      triggerKind: "SENSOR_EDGE",
      sensorDirigeraDeviceId: sensor.id,
      sensorEdgeAttribute: sensor.edgeAttribute,
      sensorEdgePolarity: "rising",
      on: true,
      toggle: true,
      activeFromLocal: "10:00",
      activeUntilLocal: "11:00",
      targetDeviceIds: [testDeviceId],
    });
    if (isDomainError(created)) {
      console.error(`FAIL: create active-hours — ${created.message}`);
      process.exit(1);
    }
    activeId = created.id;
    console.log(`OK: created active-hours Toggle ${activeId}`);

    // Outside window enter → skip
    clearSensorDebounceState();
    const outsideEnter = await handleSensorEdge({
      sensorId: sensor.id,
      attribute: sensor.edgeAttribute,
      polarity: "rising",
      receivedAt: utcInstantForLocal("03:00"),
    });
    if (outsideEnter.applied !== 0) {
      console.error("FAIL: outside-window enter must not apply");
      process.exit(1);
    }
    let row = await getAutomation(householdId, activeId);
    if (isDomainError(row) || row.toggleSession !== "idle") {
      console.error("FAIL: session should stay idle outside window");
      process.exit(1);
    }
    if (row.lastRunResult !== "skipped:outside_active_window") {
      console.error(
        `FAIL: expected skipped:outside_active_window, got ${row.lastRunResult}`,
      );
      process.exit(1);
    }
    if ((await readIsOn(testDeviceId)) !== false) {
      console.error("FAIL: light should stay off outside window");
      process.exit(1);
    }
    console.log("OK: outside window enter → skip");

    // Inside window enter → on
    await sleep(SENSOR_DEBOUNCE_MS + 50);
    clearSensorDebounceState();
    const insideEnter = await handleSensorEdge({
      sensorId: sensor.id,
      attribute: sensor.edgeAttribute,
      polarity: "rising",
      receivedAt: utcInstantForLocal("10:30"),
    });
    if (insideEnter.applied < 1) {
      console.error("FAIL: inside-window enter expected apply");
      process.exit(1);
    }
    row = await getAutomation(householdId, activeId);
    if (isDomainError(row) || row.toggleSession !== "occupied") {
      console.error("FAIL: expected occupied after in-window enter");
      process.exit(1);
    }
    console.log("OK: inside window enter → on + occupied");

    // Leave open/close outside window → still off
    await sleep(SENSOR_DEBOUNCE_MS + 50);
    clearSensorDebounceState();
    await handleSensorEdge({
      sensorId: sensor.id,
      attribute: sensor.edgeAttribute,
      polarity: "rising",
      receivedAt: utcInstantForLocal("03:10"),
    });
    row = await getAutomation(householdId, activeId);
    if (isDomainError(row) || row.toggleSession !== "leaving") {
      console.error("FAIL: expected leaving after outside leave-open");
      process.exit(1);
    }

    await sleep(SENSOR_DEBOUNCE_MS + 50);
    clearSensorDebounceState();
    const leaveOff = await handleSensorEdge({
      sensorId: sensor.id,
      attribute: sensor.edgeAttribute,
      polarity: "falling",
      receivedAt: utcInstantForLocal("03:11"),
    });
    if (leaveOff.applied < 1) {
      console.error("FAIL: leave-off outside window expected apply");
      process.exit(1);
    }
    if ((await readIsOn(testDeviceId)) !== false) {
      console.error("FAIL: light should be off after outside leave-close");
      process.exit(1);
    }
    console.log("OK: leave-off still works outside active window");
  } finally {
    if (activeId) {
      const deleted = await deleteAutomation(householdId, activeId);
      if (isDomainError(deleted)) {
        console.error(`WARN: active-hours cleanup — ${deleted.message}`);
      } else {
        console.log("OK: cleaned up active-hours automation");
      }
    }
  }

  console.log("All leave-session Toggle smoke checks passed");
}

main().catch((err) => {
  console.error("FAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
