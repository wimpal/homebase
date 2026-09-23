/**
 * Smoke test for Sunset link adjuster (T-087).
 * Opt-in — never run from deploy smoke. Does not call Dirigera.
 *
 * Requires: DATABASE_URL and MCP_HOUSEHOLD_ID (or AUTOMATION_SMOKE_HOUSEHOLD_ID)
 *
 * Usage:
 *   npm run automations:sunset-smoke
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPrismaClient } from "../src/core/db";
import {
  adjustSunsetLinkedAutomations,
  applyMinutesBefore,
  type SunsetLookupFn,
} from "../src/domain/automations";

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

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    throw new Error(`FAIL: ${msg}`);
  }
}

async function main() {
  loadDotEnv();
  const prisma = createPrismaClient();

  const householdId =
    process.env.AUTOMATION_SMOKE_HOUSEHOLD_ID?.trim() ||
    process.env.MCP_HOUSEHOLD_ID?.trim();
  if (!householdId) {
    console.error(
      "FAIL: MCP_HOUSEHOLD_ID or AUTOMATION_SMOKE_HOUSEHOLD_ID must be set",
    );
    process.exit(1);
  }

  const household = await prisma.household.findUnique({
    where: { id: householdId },
  });
  assert(household, `household ${householdId} not found`);

  // Ensure coords for the happy path.
  if (household.latitude == null || household.longitude == null) {
    await prisma.household.update({
      where: { id: householdId },
      data: {
        latitude: 52.51,
        longitude: 6.09,
        timezone: "Europe/Amsterdam",
      },
    });
  }

  const fireMarkerAt = new Date("2020-01-01T12:00:00.000Z");
  const fireMarkerResult = "smoke:fire_untouched";
  const fireMarkerSlot = "2020-01-01T21:00";

  const rule = await prisma.lightAutomation.create({
    data: {
      householdId,
      name: "T-087 sunset smoke",
      enabled: true,
      triggerKind: "SCHEDULE",
      timeLocal: "21:00",
      daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
      timezone: "Europe/Amsterdam",
      on: true,
      sunsetLinkEnabled: true,
      minutesBeforeSunset: 30,
      lastRunAt: fireMarkerAt,
      lastRunResult: fireMarkerResult,
      lastFiredSlot: fireMarkerSlot,
      targets: {
        create: [{ dirigeraDeviceId: "smoke-dummy-device" }],
      },
    },
  });

  const fixedSunset: SunsetLookupFn = () => ({
    ok: true,
    sunsetHhMm: "20:40",
  });
  const expected = applyMinutesBefore("20:40", 30); // 20:10

  try {
    const summary = await adjustSunsetLinkedAutomations({
      lookupSunset: fixedSunset,
    });
    assert(summary.failed === 0, `expected no failures, got ${summary.failed}`);

    const afterOk = await prisma.lightAutomation.findUniqueOrThrow({
      where: { id: rule.id },
    });
    assert(
      afterOk.timeLocal === expected,
      `expected timeLocal ${expected}, got ${afterOk.timeLocal}`,
    );
    assert(
      afterOk.sunsetLastAdjustResult === `ok:${expected}`,
      `unexpected adjust result: ${afterOk.sunsetLastAdjustResult}`,
    );
    assert(
      afterOk.lastRunAt?.getTime() === fireMarkerAt.getTime(),
      "lastRunAt must be untouched",
    );
    assert(
      afterOk.lastRunResult === fireMarkerResult,
      "lastRunResult must be untouched",
    );
    assert(
      afterOk.lastFiredSlot === fireMarkerSlot,
      "lastFiredSlot must be untouched",
    );
    assert(afterOk.enabled === true, "rule must stay enabled");

    // Failure path: keep last good clock.
    const failLookup: SunsetLookupFn = () => ({
      ok: false,
      reason: "smoke_forced_fail",
    });
    const failSummary = await adjustSunsetLinkedAutomations({
      lookupSunset: failLookup,
      // Yesterday so idempotent skip does not apply.
      now: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    assert(failSummary.failed >= 1, "expected at least one failure");

    const afterFail = await prisma.lightAutomation.findUniqueOrThrow({
      where: { id: rule.id },
    });
    assert(
      afterFail.timeLocal === expected,
      `failure must keep last good time ${expected}, got ${afterFail.timeLocal}`,
    );
    assert(
      afterFail.sunsetLastAdjustResult?.startsWith("failed:") === true,
      `expected failed: status, got ${afterFail.sunsetLastAdjustResult}`,
    );
    assert(afterFail.enabled === true, "failure must not disable the rule");
    assert(
      afterFail.lastRunAt?.getTime() === fireMarkerAt.getTime(),
      "lastRunAt must stay untouched after failure",
    );
    assert(
      afterFail.lastFiredSlot === fireMarkerSlot,
      "lastFiredSlot must stay untouched after failure",
    );

    console.log("OK: sunset adjust rewrite + failure-keeps-last-good");
  } finally {
    await prisma.lightAutomation.deleteMany({ where: { id: rule.id } });
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
