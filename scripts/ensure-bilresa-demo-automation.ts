/**
 * Ensure a persistent Bilresa → light flip Automation (demo / operator check).
 *
 * Defaults: Homebase Bilresa top button (singlePress) → Ballon (Kantoor), flip.
 *
 * Usage:
 *   npx tsx scripts/ensure-bilresa-demo-automation.ts
 *   npx tsx scripts/ensure-bilresa-demo-automation.ts --delete
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createAutomation,
  deleteAutomation,
  listAutomations,
  updateAutomation,
} from "../src/domain/automations";
import { isDomainError } from "../src/domain/error";

const DEMO_NAME = "Bilresa demo (Homebase → Ballon flip)";
const DEFAULT_BUTTON_ID = "f1833c72-58c7-46f1-978b-a56ad1fe26ae_1";
const DEFAULT_LIGHT_ID = "e1fb890c-cb8e-4188-adb1-d29177c6a6bf_1"; // Ballon Kantoor
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
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // optional
  }
}

async function main() {
  loadDotEnv();
  const del = process.argv.includes("--delete");

  const householdId =
    process.env.AUTOMATION_SMOKE_HOUSEHOLD_ID?.trim() ||
    process.env.MCP_HOUSEHOLD_ID?.trim();
  if (!householdId) {
    console.error("FAIL: set MCP_HOUSEHOLD_ID");
    process.exit(1);
  }

  const buttonId =
    process.env.DIRIGERA_TEST_BUTTON_DEVICE_ID?.trim() || DEFAULT_BUTTON_ID;
  const lightId =
    process.env.DIRIGERA_TEST_DEVICE_ID?.trim() || DEFAULT_LIGHT_ID;
  const identity =
    process.env.DIRIGERA_TEST_BUTTON_IDENTITY?.trim() || DEFAULT_IDENTITY;

  const listed = await listAutomations(householdId);
  if (isDomainError(listed)) {
    console.error(`FAIL: list — ${listed.message}`);
    process.exit(1);
  }

  const existing = listed.find(
    (r) => r.name === DEMO_NAME || (r.triggerKind === "BUTTON" && r.name.startsWith("Bilresa demo")),
  );

  if (del) {
    if (!existing) {
      console.log("OK: no demo rule to delete");
      return;
    }
    const removed = await deleteAutomation(householdId, existing.id);
    if (isDomainError(removed)) {
      console.error(`FAIL: delete — ${removed.message}`);
      process.exit(1);
    }
    console.log(`OK: deleted ${existing.id}`);
    return;
  }

  const input = {
    name: DEMO_NAME,
    enabled: true,
    triggerKind: "BUTTON" as const,
    buttonDirigeraDeviceId: buttonId,
    buttonIdentity: identity,
    on: true,
    toggle: true,
    targetDeviceIds: [lightId],
  };

  if (existing) {
    const updated = await updateAutomation(householdId, existing.id, input);
    if (isDomainError(updated)) {
      console.error(`FAIL: update — ${updated.message}`);
      process.exit(1);
    }
    console.log(`OK: updated demo BUTTON rule ${updated.id}`);
    console.log(
      `  press Homebase top (${identity}) → flip Ballon; see Smart Home → Automations`,
    );
    return;
  }

  const created = await createAutomation(householdId, input);
  if (isDomainError(created)) {
    console.error(`FAIL: create — ${created.message}`);
    process.exit(1);
  }
  console.log(`OK: created demo BUTTON rule ${created.id}`);
  console.log(
    `  press Homebase top (${identity}) → flip Ballon; see Smart Home → Automations`,
  );
  console.log(
    "  Worker must be running (npm run worker or NAS worker) for live presses.",
  );
}

main().catch((err) => {
  console.error("FAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
