/**
 * T-067 / T-076 — Dirigera sensor + controller discovery (read-only).
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

const CONTROLLER_DEVICE_TYPES = new Set([
  "lightController",
  "genericSwitch",
  "blindsController",
  "shortcutController",
  "soundController",
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
  "controlMode",
  "buttons",
  "switchLabel",
  "relativePosition",
  "switchGroup",
] as const;

/** Prefer matching IKEA-app name "Homebase" in room kantoor (T-076). */
const TARGET_NAME = "homebase";
const TARGET_ROOM = "kantoor";
/** Base UUID of the Homebase Bilresa pair (without _1/_2). */
const HOMEBASE_RELATION_PREFIX = "f1833c72-58c7-46f1-978b-a56ad1fe26ae";

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

function deviceName(device: Device): string {
  return (
    device.attributes.customName?.trim() ||
    device.attributes.model ||
    shortId(device.id)
  );
}

function deviceRoom(device: Device): string {
  return device.room?.name ?? "(no room)";
}

function isTargetController(device: Device): boolean {
  if (device.id.startsWith(HOMEBASE_RELATION_PREFIX)) return true;
  const name = deviceName(device).toLowerCase();
  const room = deviceRoom(device).toLowerCase();
  return name.includes(TARGET_NAME) || room.includes(TARGET_ROOM);
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
  const name = deviceName(device);
  const room = deviceRoom(device);
  const idShown = fullLocal ? device.id : shortId(device.id);
  const attrs = fullLocal
    ? redactUnknownKeys({
        ...(device.attributes as unknown as Record<string, unknown>),
      })
    : pickAllowlistedAttrs(device.attributes);
  const highlight = isTargetController(device) ? " ★" : "";
  const caps = device.capabilities
    ? {
        canReceive: device.capabilities.canReceive ?? [],
        canSend: device.capabilities.canSend ?? [],
      }
    : undefined;
  return (
    `  - ${name}${highlight} | room=${room} | deviceType=${device.deviceType} | ` +
    `type=${device.type} | reachable=${device.isReachable} | id=${idShown}\n` +
    `    attrs=${JSON.stringify(attrs)}` +
    (caps ? `\n    capabilities=${JSON.stringify(caps)}` : "")
  );
}

function isSensorDevice(device: Device): boolean {
  return (
    SENSOR_DEVICE_TYPES.has(device.deviceType) || device.type === "sensor"
  );
}

function isControllerDevice(device: Device): boolean {
  return (
    CONTROLLER_DEVICE_TYPES.has(device.deviceType) ||
    device.type === "controller"
  );
}

function eventDeviceId(updateEvent: Event): string | null {
  if (!("data" in updateEvent) || updateEvent.data == null) return null;
  const data = updateEvent.data as { id?: unknown };
  if (typeof data.id === "string" && data.id.length > 0) {
    return data.id;
  }
  return null;
}

function summarizeEvent(
  updateEvent: Event,
  fullLocal: boolean,
): string {
  const receivedAt = new Date().toISOString();
  const id = eventDeviceId(updateEvent);
  const idShown =
    id == null ? "(no-id)" : fullLocal ? id : shortId(id);

  if (updateEvent.type === "remotePressEvent") {
    const data = updateEvent.data as {
      id: string;
      clickPattern?: string;
    };
    return (
      `hubTime=${updateEvent.time} receivedAt=${receivedAt} ` +
      `type=remotePressEvent id=${idShown} ` +
      `clickPattern=${data.clickPattern ?? "(none)"}`
    );
  }

  if (updateEvent.type === "deviceStateChanged") {
    const data = updateEvent.data as Device;
    const attrs = fullLocal
      ? redactUnknownKeys({
          ...((data.attributes ?? {}) as unknown as Record<string, unknown>),
        })
      : pickAllowlistedAttrs(data.attributes);
    const name =
      (data.attributes as { customName?: string } | undefined)?.customName ||
      (id ? shortId(id) : "(unknown)");
    return (
      `hubTime=${updateEvent.time} receivedAt=${receivedAt} ` +
      `type=deviceStateChanged deviceType=${data.deviceType} name=${name} ` +
      `id=${idShown} attrs=${JSON.stringify(attrs)}`
    );
  }

  // Other event types: type + safe id only (no raw payload dump).
  return (
    `hubTime=${"time" in updateEvent ? updateEvent.time : "?"} ` +
    `receivedAt=${receivedAt} type=${updateEvent.type} id=${idShown}`
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
  console.log("=== Dirigera sensor + controller discovery (T-067 / T-076) ===");
  console.log(`dirigera package: ${pkgVersion}`);
  console.log(`hub IP: ${process.env.DIRIGERA_IP}`);
  console.log(
    `mode: ${options.fullLocal ? "full-local" : "redacted"}; ` +
      `listen=${options.listen ? `${options.listenSecs}s` : "off"}`,
  );
  console.log(
    `T-076 target hint: name≈"${TARGET_NAME}" room≈"${TARGET_ROOM}"`,
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
      deviceName(a).localeCompare(deviceName(b)),
    )) {
      console.log(formatDeviceRow(sensor, options.fullLocal));
    }
  }

  const controllers = devices.filter(isControllerDevice);
  console.log(`\nControllers / remotes (${controllers.length}):`);
  if (controllers.length === 0) {
    console.log("  (none)");
  } else {
    for (const controller of controllers.sort((a, b) =>
      deviceName(a).localeCompare(deviceName(b)),
    )) {
      console.log(formatDeviceRow(controller, options.fullLocal));
    }
  }

  const targetControllers = controllers.filter(isTargetController);
  console.log(
    `\nT-076 preferred (name≈Homebase / room≈kantoor): ${targetControllers.length}`,
  );
  if (targetControllers.length === 0) {
    console.log(
      "  (none matched — check IKEA app naming or re-pair; ★ marks matches above)",
    );
  } else {
    for (const c of targetControllers) {
      console.log(
        `  → ${deviceName(c)} | room=${deviceRoom(c)} | ` +
          `deviceType=${c.deviceType} | id=${options.fullLocal ? c.id : shortId(c.id)}`,
      );
    }
  }

  // Optional control-mode peek via controllers API when available.
  try {
    const listed = await client.controllers.list();
    console.log(`\ncontrollers.list() count: ${listed.length}`);
    for (const c of listed) {
      const name =
        c.attributes?.customName?.trim() ||
        c.attributes?.model ||
        shortId(c.id);
      const room = c.room?.name ?? "(no room)";
      const mode =
        (c.attributes as { controlMode?: string } | undefined)?.controlMode ??
        "(n/a)";
      const mark =
        name.toLowerCase().includes(TARGET_NAME) ||
        room.toLowerCase().includes(TARGET_ROOM)
          ? " ★"
          : "";
      console.log(
        `  - ${name}${mark} | room=${room} | deviceType=${c.deviceType} | ` +
          `controlMode=${mode} | id=${options.fullLocal ? c.id : shortId(c.id)}`,
      );
    }
  } catch (err) {
    console.log(
      `\ncontrollers.list() unavailable: ${
        err instanceof Error ? err.message : err
      }`,
    );
  }

  if (!options.listen) {
    console.log(
      "\nDone (inventory only). Re-run with --listen to capture " +
        "deviceStateChanged + remotePressEvent (press Bilresa buttons).",
    );
    return;
  }

  const sensorIds = new Set(sensors.map((s) => s.id));
  const controllerIds = new Set(controllers.map((c) => c.id));
  console.log(
    `\nListening for ALL event types (${options.listenSecs}s)…`,
  );
  console.log(
    `Sensors tracked: ${sensorIds.size}; controllers tracked: ${controllerIds.size}.`,
  );
  console.log(
    "Press each Bilresa (Homebase / kantoor) button now; also exercise sensors if desired.",
  );

  let eventCount = 0;
  let remotePressCount = 0;
  let sensorStateCount = 0;
  let otherCount = 0;
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
      eventCount += 1;
      if (updateEvent.type === "remotePressEvent") {
        remotePressCount += 1;
      } else if (updateEvent.type === "deviceStateChanged") {
        const id = eventDeviceId(updateEvent);
        if (id && sensorIds.has(id)) sensorStateCount += 1;
        else otherCount += 1;
      } else {
        otherCount += 1;
      }

      console.log(
        `[event #${eventCount}] ${summarizeEvent(updateEvent, options.fullLocal)}`,
      );
    });

    void timer;
  });

  process.off("SIGINT", onSignal);
  process.off("SIGTERM", onSignal);
  stop();

  console.log(
    `\nListen finished. total=${eventCount} remotePress=${remotePressCount} ` +
      `sensorStateChanged=${sensorStateCount} other=${otherCount}`,
  );
  if (remotePressCount === 0) {
    console.log(
      "NOTE: no remotePressEvent this run — press Bilresa while listening, " +
        "or try controlMode=shortcut via controllers.setControlMode, then re-listen.",
    );
  }
}

main().catch((err) => {
  console.error("FAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
