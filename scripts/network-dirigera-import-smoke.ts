/**
 * T-111 smoke: Dirigera -> Network inventory import.
 *
 * Usage:
 *   npx tsx scripts/network-dirigera-import-smoke.ts             # pure map tests
 *   npx tsx scripts/network-dirigera-import-smoke.ts --live      # + preview (read-only)
 *   npx tsx scripts/network-dirigera-import-smoke.ts --confirm   # + confirm/idempotency (cleans up)
 *
 * --live / --confirm need DIRIGERA_IP + DIRIGERA_TOKEN + DATABASE_URL + MCP_HOUSEHOLD_ID.
 * The confirm pass creates rows for hub devices not yet enrolled, verifies dedupe and
 * location rules, then deletes what it created. It never touches Smart Home `Device`.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "../src/core/db";
import { isDomainError } from "../src/domain/error";
import {
  confirmDirigeraImport,
  listDirigeraHubDevices,
  listNetworkDevices,
  mapDirigeraToNetworkTypeSlug,
  previewDirigeraImport,
} from "../src/domain/network";
import {
  buildLocationIndex,
  matchRoomLocation,
} from "../src/domain/network/dirigera-import/locations";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
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
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // .env optional when vars are exported
  }
}

function pureTests() {
  const cases: Array<[{ type: string; deviceType: string }, string]> = [
    [{ type: "light", deviceType: "light" }, "light"],
    [{ type: "unknown", deviceType: "light" }, "light"],
    [{ type: "blinds", deviceType: "blinds" }, "blind"],
    [{ type: "controller", deviceType: "genericSwitch" }, "remote"],
    [{ type: "unknown", deviceType: "lightController" }, "remote"],
    [{ type: "unknown", deviceType: "blindsController" }, "remote"],
    [{ type: "unknown", deviceType: "shortcutController" }, "remote"],
    [{ type: "unknown", deviceType: "soundController" }, "remote"],
    [{ type: "sensor", deviceType: "unknown" }, "sensor"],
    [{ type: "unknown", deviceType: "openCloseSensor" }, "sensor"],
    [{ type: "unknown", deviceType: "motionSensor" }, "sensor"],
    [{ type: "unknown", deviceType: "environmentSensor" }, "sensor"],
    [{ type: "unknown", deviceType: "lightSensor" }, "sensor"],
    [{ type: "unknown", deviceType: "occupancySensor" }, "sensor"],
    [{ type: "unknown", deviceType: "waterSensor" }, "sensor"],
    [{ type: "outlet", deviceType: "outlet" }, "outlet"],
    [{ type: "gateway", deviceType: "gateway" }, "hub"],
    [{ type: "speaker", deviceType: "speaker" }, "other"],
    [{ type: "airPurifier", deviceType: "airPurifier" }, "other"],
    [{ type: "repeater", deviceType: "repeater" }, "other"],
    [{ type: "unknown", deviceType: "unknown" }, "other"],
  ];
  for (const [device, expected] of cases) {
    const got = mapDirigeraToNetworkTypeSlug(device);
    assert(got === expected, `map ${device.type}/${device.deviceType} -> ${got}, want ${expected}`);
  }

  const index = buildLocationIndex([
    { id: "1", slug: "keuken", name: "Keuken" },
    { id: "2", slug: "living-room", name: "Living Room" },
  ]);
  assert(matchRoomLocation(index, " Keuken ")?.id === "1", "room trim/case match");
  assert(matchRoomLocation(index, "KEUKEN")?.id === "1", "room uppercase match");
  assert(matchRoomLocation(index, "Living-Room")?.id === "2", "room slug match");
  assert(matchRoomLocation(index, "Zolder") === null, "unknown room no match");
  assert(matchRoomLocation(index, undefined) === null, "no room no match");

  console.log("pure map/location tests OK");
}

type Counts = { devices: number; smartDevices: number; locations: number };

async function counts(householdId: string): Promise<Counts> {
  return {
    devices: await prisma.networkDevice.count({ where: { householdId } }),
    smartDevices: await prisma.device.count({ where: { householdId } }),
    locations: await prisma.deviceLocation.count({ where: { householdId } }),
  };
}

function assertSameCounts(a: Counts, b: Counts, msg: string) {
  assert(
    a.devices === b.devices && a.smartDevices === b.smartDevices && a.locations === b.locations,
    `${msg} (before ${JSON.stringify(a)} after ${JSON.stringify(b)})`,
  );
}

async function main() {
  loadDotEnv();
  pureTests();

  const args = process.argv.slice(2);
  const doConfirm = args.includes("--confirm");
  const live = doConfirm || args.includes("--live");
  if (!live) {
    console.log("OK (pure only; use --live for hub preview, --confirm for import smoke)");
    return;
  }

  if (!process.env.DIRIGERA_IP || !process.env.DIRIGERA_TOKEN) {
    throw new Error("DIRIGERA_IP and DIRIGERA_TOKEN must be set for --live/--confirm");
  }
  const householdIdRaw = process.env.MCP_HOUSEHOLD_ID?.trim();
  if (!householdIdRaw) {
    throw new Error("MCP_HOUSEHOLD_ID must be set for --live/--confirm");
  }
  const householdId = householdIdRaw;

  const hub = await listDirigeraHubDevices();
  assert(!isDomainError(hub), isDomainError(hub) ? hub.message : "hub list");
  assert(hub.length > 0, "hub returned no devices");
  for (const device of hub) {
    assert(Boolean(device.id && device.name && device.deviceType), `bad hub row ${device.id}`);
  }
  console.log(`hub OK: ${hub.length} device(s) incl. ${hub.filter((d) => mapDirigeraToNetworkTypeSlug(d) === "hub").length} hub row(s)`);

  const before = await counts(householdId);
  const preview = await previewDirigeraImport(householdId);
  assert(!isDomainError(preview), isDomainError(preview) ? preview.message : "preview");
  assert(preview.candidates.length === hub.length, "preview candidate count == hub count");

  const afterPreview = await counts(householdId);
  assertSameCounts(before, afterPreview, "preview must not write");

  const savedIp = process.env.DIRIGERA_IP;
  const savedToken = process.env.DIRIGERA_TOKEN;
  delete process.env.DIRIGERA_IP;
  delete process.env.DIRIGERA_TOKEN;
  const unconfigured = await previewDirigeraImport(householdId);
  assert(isDomainError(unconfigured) && unconfigured.reason === "dirigera_not_configured", "preview without hub config -> dirigera_not_configured");
  process.env.DIRIGERA_IP = savedIp;
  process.env.DIRIGERA_TOKEN = savedToken;

  for (const c of preview.candidates) {
    console.log(
      `  - [${c.status}] ${c.name} (${c.deviceType} -> ${c.typeSlug}) room=${c.roomName ?? "-"} -> ${c.locationSlug} (${c.locationStatus})`,
    );
  }

  if (!doConfirm) {
    console.log("OK (live preview, no writes)");
    return;
  }

  const linkedBefore = new Set(
    (
      await prisma.networkDevice.findMany({
        where: { householdId, dirigeraId: { not: null } },
        select: { dirigeraId: true },
      })
    ).map((row) => row.dirigeraId as string),
  );
  const locationIdsBefore = new Set(
    (
      await prisma.deviceLocation.findMany({
        where: { householdId },
        select: { id: true },
      })
    ).map((row) => row.id),
  );
  const createdHubIds: string[] = [];

  async function runConfirm(ids: string[], createMissingLocations: boolean) {
    const result = await confirmDirigeraImport(householdId, {
      selectedDirigeraIds: ids,
      createMissingLocations,
    });
    assert(!isDomainError(result), isDomainError(result) ? result.message : "confirm");
    return result;
  }

  try {
    const newCandidates = preview.candidates.filter((c) => c.status === "new");
    const missingRoom = newCandidates.find((c) => c.locationStatus === "missing");

    if (missingRoom) {
      const res = await runConfirm([missingRoom.dirigeraId], true);
      assert(res.locations_created === 1, `flag-true should create 1 location, got ${res.locations_created}`);
      assert(res.created === 1, "flag-true should create the device");
      createdHubIds.push(missingRoom.dirigeraId);

      const row = await prisma.networkDevice.findUnique({
        where: { householdId_dirigeraId: { householdId, dirigeraId: missingRoom.dirigeraId } },
        include: { location: true },
      });
      assert(row != null, "flag-true device row exists");
      assert(
        row.location.name.trim().toLowerCase() === missingRoom.roomName?.trim().toLowerCase(),
        `created location name should match room (${row.location.name} vs ${missingRoom.roomName})`,
      );

      const again = await runConfirm([missingRoom.dirigeraId], false);
      assert(again.created === 0 && again.skipped_enrolled === 1, "re-confirm skips enrolled");
      assert(again.locations_created === 0, "re-confirm creates no location");
    } else {
      console.log("note: no missing-room candidate on this hub - flag-true location creation not exercised live");
    }

    const rest = newCandidates.filter((c) => c.dirigeraId !== missingRoom?.dirigeraId);
    if (rest.length > 0) {
      const ids = rest.map((c) => c.dirigeraId);
      const [r1, r2] = await Promise.all([
        runConfirm(ids, false),
        runConfirm(ids, false),
      ]);
      const totalCreated = r1.created + r2.created;
      assert(totalCreated === ids.length, `concurrent confirms should create each device once (got ${totalCreated}/${ids.length})`);
      assert(r1.failed.length === 0 && r2.failed.length === 0, "concurrent confirms should not fail hard");
      createdHubIds.push(...ids);

      const rows = await prisma.networkDevice.count({
        where: { householdId, dirigeraId: { in: ids } },
      });
      assert(rows === ids.length, "exactly one row per imported hub id");

      const createdRows = await prisma.networkDevice.findMany({
        where: { householdId, dirigeraId: { in: ids } },
        select: { id: true },
      });
      const listed = await listNetworkDevices(householdId);
      assert(!isDomainError(listed), isDomainError(listed) ? listed.message : "MCP list");
      for (const row of createdRows) {
        assert(listed.some((device) => device.id === row.id), "imported row visible to MCP list");
      }
      assert(
        !listed.some((device) => Object.prototype.hasOwnProperty.call(device, "dirigeraId")),
        "MCP list must never include dirigeraId",
      );

      const unknownExpectations = rest.filter((c) => c.locationStatus !== "matched");
      if (unknownExpectations.length > 0) {
        const unknownRow = await prisma.networkDevice.findFirst({
          where: {
            householdId,
            dirigeraId: { in: unknownExpectations.map((c) => c.dirigeraId) },
            location: { slug: "unknown" },
          },
          select: { id: true },
        });
        assert(unknownRow != null, "unmatched rooms should land in reserved unknown");
      }

      const idem = await runConfirm(ids, false);
      assert(idem.created === 0, "second run creates 0");
      assert(idem.skipped_enrolled === ids.length, "second run skips all enrolled (or retired)");
    } else {
      console.log("note: no new candidates - import already enrolled (idempotency only)");
    }

    const after = await counts(householdId);
    assert(after.smartDevices === before.smartDevices, "Smart Home Device count must not change");
    console.log("OK (confirm smoke passed)");
  } finally {
    if (createdHubIds.length > 0) {
      await prisma.networkDevice.deleteMany({
        where: { householdId, dirigeraId: { in: createdHubIds } },
      });
    }
    const locationIdsAfter = await prisma.deviceLocation.findMany({
      where: { householdId },
      select: { id: true },
    });
    for (const row of locationIdsAfter) {
      if (locationIdsBefore.has(row.id)) continue;
      const refs = await prisma.networkDevice.count({ where: { locationId: row.id } });
      if (refs === 0) {
        await prisma.deviceLocation.delete({ where: { id: row.id } }).catch(() => {});
      }
    }
    console.log(
      `cleanup: removed ${createdHubIds.length} imported row(s) and any new locations (pre-existing: ${linkedBefore.size} linked device(s))`,
    );
  }

  const afterCleanup = await counts(householdId);
  assertSameCounts(before, afterCleanup, "cleanup must restore original row counts");
  console.log("OK (cleanup restored original counts)");
}

main().catch((err) => {
  console.error("FAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
