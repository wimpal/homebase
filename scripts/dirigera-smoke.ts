/**
 * Smoke test for Dirigera hub connectivity (T-031 Phase A).
 * Requires: DIRIGERA_IP + DIRIGERA_TOKEN in .env
 *
 * Usage:
 *   npm run dirigera:smoke
 *   DIRIGERA_TEST_DEVICE_ID=<light-id> npm run dirigera:smoke   # toggle test light
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isDomainError } from "../src/domain/error";
import {
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
    // .env optional when vars are exported
  }
}

async function main() {
  loadDotEnv();

  if (!process.env.DIRIGERA_IP || !process.env.DIRIGERA_TOKEN) {
    console.error("FAIL: DIRIGERA_IP and DIRIGERA_TOKEN must be set");
    process.exit(1);
  }

  console.log(`Checking connectivity to Dirigera at ${process.env.DIRIGERA_IP}...`);
  const connectivity = await verifyDirigeraConnectivity();
  if (isDomainError(connectivity)) {
    console.error(`FAIL: ${connectivity.message}`);
    process.exit(1);
  }
  console.log("OK: hub reachable");

  const lights = await listDirigeraLights();
  if (isDomainError(lights)) {
    console.error(`FAIL: ${lights.message}`);
    process.exit(1);
  }

  console.log(`OK: found ${lights.length} light(s)`);
  for (const light of lights) {
    const room = light.room ? ` (${light.room})` : "";
    const state = light.isOn ? "on" : "off";
    console.log(`  - ${light.name}${room} [${light.id}] — ${state}`);
  }

  const testDeviceId = process.env.DIRIGERA_TEST_DEVICE_ID;
  if (!testDeviceId) {
    console.log("Skip toggle: set DIRIGERA_TEST_DEVICE_ID to test on/off");
    return;
  }

  console.log(`Toggling device ${testDeviceId} off → on → off...`);
  for (const on of [false, true, false] as const) {
    const result = await setDirigeraLightState(testDeviceId, on);
    if (!result.success) {
      console.error(`FAIL: toggle to ${on ? "on" : "off"} — ${result.error}`);
      process.exit(1);
    }
    console.log(`  OK: set ${on ? "on" : "off"}`);
  }

  console.log("All Dirigera smoke checks passed");
}

main().catch((err) => {
  console.error("FAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
