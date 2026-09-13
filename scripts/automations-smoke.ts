/**
 * Smoke test for LightAutomation domain (T-064).
 * Opt-in write test — never run from deploy smoke.
 *
 * Requires: DIRIGERA_IP, DIRIGERA_TOKEN, DIRIGERA_TEST_DEVICE_ID,
 * and MCP_HOUSEHOLD_ID (or AUTOMATION_SMOKE_HOUSEHOLD_ID) in .env
 *
 * Usage:
 *   npm run automations:smoke
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  applyAutomationAction,
  createAutomation,
  deleteAutomation,
  setAutomationEnabled,
} from "../src/domain/automations";
import { isDomainError } from "../src/domain/error";
import { verifyDirigeraConnectivity } from "../src/domain/smarthome";

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

  console.log(`Checking Dirigera at ${process.env.DIRIGERA_IP}...`);
  const connectivity = await verifyDirigeraConnectivity();
  if (isDomainError(connectivity)) {
    console.error(`FAIL: ${connectivity.message}`);
    process.exit(1);
  }
  console.log("OK: hub reachable");

  let automationId: string | undefined;
  let failed = false;
  try {
    const created = await createAutomation(householdId, {
      name: `T-064 smoke ${new Date().toISOString()}`,
      timeLocal: "21:00",
      daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
      on: true,
      brightness: 50,
      targetDeviceIds: [testDeviceId],
    });
    if (isDomainError(created)) {
      console.error(`FAIL: create — ${created.message}`);
      failed = true;
      return;
    }
    automationId = created.id;
    console.log(`OK: created automation ${automationId}`);

    const applied = await applyAutomationAction(householdId, automationId);
    if (isDomainError(applied)) {
      console.error(`FAIL: apply — ${applied.message}`);
      failed = true;
      return;
    }
    if (applied.failed > 0 || applied.lastRunResult !== "ok") {
      console.error(
        `FAIL: apply result ${applied.lastRunResult} (failed=${applied.failed})`,
      );
      failed = true;
      return;
    }
    console.log(
      `OK: apply — lastRunResult=${applied.lastRunResult} succeeded=${applied.succeeded}`,
    );

    const disabled = await setAutomationEnabled(
      householdId,
      automationId,
      false,
    );
    if (isDomainError(disabled)) {
      console.error(`FAIL: disable — ${disabled.message}`);
      failed = true;
      return;
    }
    console.log("OK: disabled");

    const refused = await applyAutomationAction(householdId, automationId);
    if (!isDomainError(refused) || refused.code !== "conflict") {
      console.error(
        "FAIL: expected conflict when applying disabled automation",
      );
      failed = true;
      return;
    }
    console.log(`OK: apply refused while disabled — ${refused.message}`);

    console.log("All automations smoke checks passed");
  } finally {
    if (automationId) {
      const deleted = await deleteAutomation(householdId, automationId);
      if (isDomainError(deleted)) {
        console.error(`WARN: cleanup delete failed — ${deleted.message}`);
      } else {
        console.log(`OK: cleaned up automation ${automationId}`);
      }
    }
  }

  if (failed) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("FAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
