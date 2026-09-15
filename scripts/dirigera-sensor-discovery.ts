/**
 * T-067 — Dirigera sensor discovery (read-only).
 * Requires: DIRIGERA_IP + DIRIGERA_TOKEN in .env
 *
 * Usage:
 *   npm run dirigera:sensors
 *   npm run dirigera:sensors -- --listen
 *   npm run dirigera:sensors -- --listen --listen-secs 120
 *   npm run dirigera:sensors -- --full-local
 *
 * Default output is --redacted (allowlisted attrs only). Never prints the token.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createDirigeraClient, type Device, type Event } from "dirigera";

const SENSOR_DEVICE_TYPES = new Set([
  "motionSensor",
  "openCloseSensor",
  "environmentSensor",
  "occupancySensor",
  "lightSensor",
  "waterSensor",
]);

const ALLOWLIST_ATTR_KEYS = [
  "customName",
  "model",
  "isDetected",
  "isOn",
  "isOpen",
  "batteryPercentage",
  "illuminance",
  "currentTemperature",
  "currentRH",
  "currentPM25",
  "vocIndex",
  "currentCO2",
  "waterLeakDetected",
] as const;

type CliOptions = {
  fullLocal: boolean;
  listen: boolean;
  listenSecs: number;
};

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

function parseArgs(argv: string[]): CliOptions {
  const fullLocal = argv.includes("--full-local");
  const listenFlag = argv.includes("--listen");
  const listenSecsIdx = argv.indexOf("--listen-secs");
  let listenSecs = 0;
  if (listenSecsIdx !== -1) {
    const raw = Number(argv[listenSecsIdx + 1]);
    if (!Number.isFinite(raw)) {
      throw new Error("--listen-secs requires a number");
    }
    listenSecs = raw;
  } else if (listenFlag) {
    const fromEnv = Number(process.env.DIRIGERA_DISCOVERY_LISTEN_SECS ?? 300);
    listenSecs = Number.isFinite(fromEnv) ? fromEnv : 300;
  }
  if (listenSecs > 0) {
    listenSecs = Math.min(900, Math.max(30, Math.floor(listenSecs)));
  }
  return {
    fullLocal,
    listen: listenSecs > 0,
    listenSecs,
  };
}

function dirigeraPackageVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(
        resolve(process.cwd(), "node_modules/dirigera/package.json"),
        "utf8",
      ),
    ) as { version?: string };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

function shortId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

function pickAllowlistedAttrs(
  attrs: Device["attributes"] | undefined,
): Record<string, unknown> {
  if (!attrs) return {};
  const out: Record<string, unknown> = {};
  for (const key of ALLOWLIST_ATTR_KEYS) {
    const bag = attrs as unknown as Record<string, unknown>;
    if (key in attrs && bag[key] !== undefined) {
      out[key] = bag[key];
    }
  }
  const sensorConfig = (
    attrs as { sensorConfig?: { onDuration?: number; scheduleOn?: boolean } }
  ).sensorConfig;
  if (sensorConfig) {
    out.sensorConfig = {
      onDuration: sensorConfig.onDuration,
      scheduleOn: sensorConfig.scheduleOn,
    };
  }
  return out;
}

function redactUnknownKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const forbidden = new Set([
    "serialNumber",
    "qrCode",
    "setupCode",
    "productCode",
    "firmwareVersion",
    "hardwareVersion",
    "manufacturer",
  ]);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (forbidden.has(k)) continue;
    out[k] = v;
  }
  return out;
}

function formatDeviceRow(device: Device, fullLocal: boolean): string {
  const name =
    device.attributes.customName?.trim() ||
    device.attributes.model ||
    shortId(device.id);
  const room = device.room?.name ?? "(no room)";
  const idShown = fullLocal ? device.id : shortId(device.id);
  const attrs = fullLocal
    ? redactUnknownKeys({
        ...(device.attributes as unknown as Record<string, unknown>),
      })
    : pickAllowlistedAttrs(device.attributes);
  return (
    `  - ${name} | room=${room} | deviceType=${device.deviceType} | ` +
    `type=${device.type} | reachable=${device.isReachable} | id=${idShown}\n` +
    `    attrs=${JSON.stringify(attrs)}`
  );
}

function isSensorDevice(device: Device): boolean {
  return (
    SENSOR_DEVICE_TYPES.has(device.deviceType) || device.type === "sensor"
  );
}

async function main() {
  loadDotEnv();
  const options = parseArgs(process.argv.slice(2));

  if (!process.env.DIRIGERA_IP || !process.env.DIRIGERA_TOKEN) {
    console.error("FAIL: DIRIGERA_IP and DIRIGERA_TOKEN must be set");
    process.exit(1);
  }

  const pkgVersion = dirigeraPackageVersion();
  console.log("=== Dirigera sensor discovery (T-067) ===");
  console.log(`dirigera package: ${pkgVersion}`);
  console.log(`hub IP: ${process.env.DIRIGERA_IP}`);
  console.log(
    `mode: ${options.fullLocal ? "full-local" : "redacted"}; ` +
      `listen=${options.listen ? `${options.listenSecs}s` : "off"}`,
  );
  console.log("");

  const client = await createDirigeraClient({
    gatewayIP: process.env.DIRIGERA_IP,
    accessToken: process.env.DIRIGERA_TOKEN,
    rejectUnauthorized: false,
  });

  try {
    await client.home();
  } catch (err) {
    console.error(
      "FAIL: hub unreachable —",
      err instanceof Error ? err.message : err,
    );
    process.exit(1);
  }
  console.log("OK: hub reachable");

  const devices = await client.devices.list();
  const byType = new Map<string, Device[]>();
  for (const device of devices) {
    const key = device.deviceType || device.type || "unknown";
    const list = byType.get(key) ?? [];
    list.push(device);
    byType.set(key, list);
  }

  console.log(`\nDevice counts by deviceType (${devices.length} total):`);
  const sortedTypes = [...byType.keys()].sort();
  for (const type of sortedTypes) {
    console.log(`  ${type}: ${byType.get(type)!.length}`);
  }

  const sensors = devices.filter(isSensorDevice);
  console.log(`\nSensors (${sensors.length}):`);
  if (sensors.length === 0) {
    console.log("  (none)");
  } else {
    for (const sensor of sensors.sort((a, b) =>
      (a.attributes.customName || a.id).localeCompare(
        b.attributes.customName || b.id,
      ),
    )) {
      console.log(formatDeviceRow(sensor, options.fullLocal));
    }
  }

  if (!options.listen) {
    console.log(
      "\nDone (inventory only). Re-run with --listen to capture deviceStateChanged.",
    );
    return;
  }

  const sensorIds = new Set(sensors.map((s) => s.id));
  console.log(
    `\nListening for deviceStateChanged on ${sensorIds.size} sensor id(s) ` +
      `for ${options.listenSecs}s…`,
  );
  console.log(
    "Exercise motion / open-close sensors now (walk past, open doors).",
  );

  let eventCount = 0;
  let stopped = false;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    try {
      client.stopListeningForUpdates();
    } catch {
      // already closed
    }
  };

  const onSignal = () => {
    console.log("\nSignal received — stopping listener");
    stop();
    process.exit(130);
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  await new Promise<void>((resolveListen) => {
    const timer = setTimeout(() => {
      stop();
      resolveListen();
    }, options.listenSecs * 1000);

    client.startListeningForUpdates((updateEvent: Event) => {
      const receivedAt = new Date().toISOString();
      if (updateEvent.type !== "deviceStateChanged") return;
      if (!sensorIds.has(updateEvent.data.id)) return;

      eventCount += 1;
      const attrs = options.fullLocal
        ? redactUnknownKeys({
            ...((updateEvent.data.attributes ?? {}) as Record<string, unknown>),
          })
        : pickAllowlistedAttrs(
            updateEvent.data.attributes as Device["attributes"] | undefined,
          );
      const name =
        (updateEvent.data.attributes as { customName?: string } | undefined)
          ?.customName || shortId(updateEvent.data.id);
      console.log(
        `[event #${eventCount}] hubTime=${updateEvent.time} receivedAt=${receivedAt} ` +
          `deviceType=${updateEvent.data.deviceType} name=${name} ` +
          `id=${options.fullLocal ? updateEvent.data.id : shortId(updateEvent.data.id)} ` +
          `attrs=${JSON.stringify(attrs)}`,
      );
    });

    // Keep reference so timer isn't GC'd oddly; clear on stop path above.
    void timer;
  });

  process.off("SIGINT", onSignal);
  process.off("SIGTERM", onSignal);
  stop();

  console.log(`\nListen finished. Sensor state-change events: ${eventCount}`);
  if (eventCount === 0) {
    console.log(
      "NOTE: no live edges observed this run — inventory still valid; " +
        "re-run --listen while exercising sensors, or accept inventory-only risk for T-068 gate.",
    );
  }
}

main().catch((err) => {
  console.error("FAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
