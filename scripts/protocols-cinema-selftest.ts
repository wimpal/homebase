/**
 * Self-test for Cinema Protocol run paths (no live TV / Dirigera).
 * Usage: npx tsx scripts/protocols-cinema-selftest.ts
 *
 * Pure helpers always run. DB-backed orchestration runs only when
 * PROTOCOLS_SELFTEST_DB=1 (snapshots and restores Cinema settings).
 */
import {
  __clearProtocolRunLocksForTests,
  isPastCutoff,
  resolveProtocol,
  runProtocol,
} from "../src/domain/protocols";

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

// --- registry ---
const cinema = resolveProtocol("Cinema");
assert(cinema?.id === "cinema", "resolve Cinema");
assert(resolveProtocol("bioscoop")?.id === "cinema", "resolve bioscoop alias");
assert(resolveProtocol("CINEMA")?.id === "cinema", "case-insensitive");
assert(resolveProtocol("unknown-xyz") === null, "unknown null");

// --- cutoff (Europe/Amsterdam) ---
const before = new Date("2026-09-25T10:00:00+02:00");
const after = new Date("2026-09-25T20:00:00+02:00");
assert(
  !isPastCutoff(before, "18:00", "Europe/Amsterdam"),
  "10:00 before 18:00",
);
assert(
  isPastCutoff(after, "18:00", "Europe/Amsterdam"),
  "20:00 past 18:00",
);
assert(
  isPastCutoff(new Date("2026-09-25T18:00:00+02:00"), "18:00", "Europe/Amsterdam"),
  "exact cutoff inclusive",
);

console.log("OK: registry + cutoff helpers");

if (process.env.PROTOCOLS_SELFTEST_DB !== "1") {
  console.log(
    "SKIP: DB orchestration (set PROTOCOLS_SELFTEST_DB=1 to run; snapshots settings)",
  );
  process.exit(0);
}

if (!process.env.DATABASE_URL) {
  console.error("FAIL: PROTOCOLS_SELFTEST_DB=1 requires DATABASE_URL");
  process.exit(1);
}

async function main() {
  const { prisma } = await import("../src/core/db");

  const household = await prisma.household.findFirst({
    select: { id: true },
  });
  if (!household) {
    console.error("FAIL: no household in DB");
    process.exit(1);
  }

  __clearProtocolRunLocksForTests();

  const snapshot = await prisma.protocolCinemaSettings.findUnique({
    where: { householdId: household.id },
  });

  let tvId: string | null = null;

  try {
    await prisma.protocolCinemaSettings.upsert({
      where: { householdId: household.id },
      create: {
        householdId: household.id,
        networkDeviceId: null,
        selectedLightIds: [],
        dimBrightness: 30,
        cutoffHhMm: "18:00",
      },
      update: {
        networkDeviceId: null,
        selectedLightIds: [],
        cutoffHhMm: "18:00",
        deviceLocationId: null,
        dirigeraRoomName: null,
      },
    });

    const noTv = await runProtocol(household.id, "Cinema", {
      now: after,
      launchTv: async () => {
        throw new Error("launchTv should not be called without TV");
      },
    });
    assert(noTv.success === false, "no TV → fail");
    assert(noTv.status === "failed", "no TV status failed");

    const unknown = await runProtocol(household.id, "not-a-protocol");
    assert(unknown.status === "not_found", "unknown → not_found");

    const type = await prisma.networkDeviceType.findFirst({
      where: { householdId: household.id },
    });
    const location = await prisma.deviceLocation.findFirst({
      where: { householdId: household.id },
    });
    if (!type || !location) {
      console.log("SKIP: remaining DB cases (no network type/location)");
      return;
    }

    const tv = await prisma.networkDevice.create({
      data: {
        householdId: household.id,
        name: `cinema-selftest-tv-${Date.now()}`,
        typeId: type.id,
        locationId: location.id,
        macAddress: `aa:bb:cc:dd:ee:${String(Date.now() % 100).padStart(2, "0")}`,
        wakeAllowed: true,
        ssapClientKey: "selftest-key",
        jellyfinAppId: "selftest.jellyfin",
        lastSeenIp: "127.0.0.1",
      },
    });
    tvId = tv.id;

    await prisma.protocolCinemaSettings.update({
      where: { householdId: household.id },
      data: {
        networkDeviceId: tv.id,
        deviceLocationId: location.id,
        dirigeraRoomName: "Living room",
        selectedLightIds: ["light-a", "light-b"],
        dimBrightness: 30,
        cutoffHhMm: "18:00",
      },
    });

    let launchCount = 0;
    let lightCalls: string[] = [];

    const beforeCutoff = await runProtocol(household.id, "bioscoop", {
      now: before,
      launchTv: async () => {
        launchCount += 1;
        return { ok: true };
      },
      setLight: async (id) => {
        lightCalls.push(id);
        return { success: true };
      },
    });
    assert(beforeCutoff.success === true, "before cutoff success");
    assert(beforeCutoff.status === "ok_tv_only", "before cutoff ok_tv_only");
    assert(
      beforeCutoff.lights?.skipped_reason === "before_cutoff",
      "before_cutoff skip",
    );
    assert(launchCount === 1, "TV launched once before cutoff");
    assert(lightCalls.length === 0, "no lights before cutoff");

    lightCalls = [];
    const tvFail = await runProtocol(household.id, "Cinema", {
      now: after,
      launchTv: async () => ({ ok: false, error: "SSAP unpaired (selftest)" }),
      setLight: async (id) => {
        lightCalls.push(id);
        return { success: true };
      },
    });
    assert(tvFail.success === false, "TV fail → fail");
    assert(tvFail.lights?.skipped_reason === "tv_failed", "tv_failed skip");
    assert(lightCalls.length === 0, "no lights after TV fail");

    const dryRun = await runProtocol(household.id, "Cinema", {
      now: after,
      launchTv: async () => ({ ok: true, dry_run: true }),
      setLight: async () => {
        throw new Error("setLight must not run on SSAP dry-run");
      },
    });
    assert(dryRun.success === true, "dry-run success");
    assert(dryRun.lights?.applied === false, "dry-run no lights");

    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const slow = runProtocol(household.id, "Cinema", {
      now: after,
      launchTv: async () => {
        await gate;
        return { ok: true };
      },
      setLight: async () => ({ success: true }),
    });
    await new Promise((r) => setTimeout(r, 20));
    const concurrent = await runProtocol(household.id, "Cinema", {
      now: after,
      launchTv: async () => ({ ok: true }),
    });
    assert(concurrent.status === "already_running", "concurrent already_running");
    release();
    const slowResult = await slow;
    assert(slowResult.success === true, "slow run eventually ok");

    await prisma.protocolCinemaSettings.update({
      where: { householdId: household.id },
      data: { selectedLightIds: [] },
    });
    const emptyLamps = await runProtocol(household.id, "Cinema", {
      now: after,
      launchTv: async () => ({ ok: true }),
      setLight: async () => {
        throw new Error("setLight should not run");
      },
    });
    assert(
      emptyLamps.lights?.skipped_reason === "empty_selection",
      "empty_selection",
    );

    await prisma.protocolCinemaSettings.update({
      where: { householdId: household.id },
      data: {
        selectedLightIds: ["light-a"],
        deviceLocationId: null,
        dirigeraRoomName: null,
      },
    });
    const missingMap = await runProtocol(household.id, "Cinema", {
      now: after,
      launchTv: async () => ({ ok: true }),
      setLight: async () => ({ success: true }),
    });
    assert(missingMap.success === false, "missing map fails");
    assert(
      (missingMap.error ?? "").toLowerCase().includes("room map"),
      "missing map message",
    );

    console.log("OK: protocols-cinema selftest passed (DB)");
  } finally {
    if (tvId) {
      await prisma.networkDevice.delete({ where: { id: tvId } }).catch(() => {});
    }
    if (snapshot) {
      await prisma.protocolCinemaSettings.upsert({
        where: { householdId: household.id },
        create: {
          householdId: household.id,
          networkDeviceId: snapshot.networkDeviceId,
          deviceLocationId: snapshot.deviceLocationId,
          dirigeraRoomName: snapshot.dirigeraRoomName,
          selectedLightIds: snapshot.selectedLightIds,
          dimBrightness: snapshot.dimBrightness,
          cutoffHhMm: snapshot.cutoffHhMm,
          sunsetLinkEnabled: snapshot.sunsetLinkEnabled,
          minutesBeforeSunset: snapshot.minutesBeforeSunset,
          sunsetLastAdjustAt: snapshot.sunsetLastAdjustAt,
          sunsetLastAdjustResult: snapshot.sunsetLastAdjustResult,
        },
        update: {
          networkDeviceId: snapshot.networkDeviceId,
          deviceLocationId: snapshot.deviceLocationId,
          dirigeraRoomName: snapshot.dirigeraRoomName,
          selectedLightIds: snapshot.selectedLightIds,
          dimBrightness: snapshot.dimBrightness,
          cutoffHhMm: snapshot.cutoffHhMm,
          sunsetLinkEnabled: snapshot.sunsetLinkEnabled,
          minutesBeforeSunset: snapshot.minutesBeforeSunset,
          sunsetLastAdjustAt: snapshot.sunsetLastAdjustAt,
          sunsetLastAdjustResult: snapshot.sunsetLastAdjustResult,
        },
      });
    } else {
      await prisma.protocolCinemaSettings
        .delete({ where: { householdId: household.id } })
        .catch(() => {});
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
