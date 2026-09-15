/**
 * Dirigera WebSocket observer for SENSOR_EDGE automations (T-068).
 * Seed-gated, generation-scoped, no boot replay.
 */
import type { DirigeraClient, Event } from "dirigera";
import { isDomainError } from "@/domain/error";
import {
  clearSensorDebounceState,
  handleSensorEdge,
} from "@/domain/automations/sensor";
import {
  getDirigeraClient,
  isDirigeraConfigured,
  isEdgeSensorDevice,
  listDirigeraEdgeSensors,
} from "@/domain/smarthome";

type EdgeAttr = "isOpen" | "isDetected";

type ObserverState = {
  ready: boolean;
  /** Generation of the active listener callback; stale gens are ignored. */
  generation: number;
  edgeValues: Map<string, boolean | null>;
  edgeAttrs: Map<string, EdgeAttr>;
  stopping: boolean;
};

const state: ObserverState = {
  ready: false,
  generation: 0,
  edgeValues: new Map(),
  edgeAttrs: new Map(),
  stopping: false,
};

let started = false;
let clientRef: DirigeraClient | null = null;

function readEdgeValue(
  attributes: { isOpen?: boolean; isDetected?: boolean } | undefined,
  attr: EdgeAttr,
): boolean | null {
  if (!attributes) return null;
  const raw = attr === "isOpen" ? attributes.isOpen : attributes.isDetected;
  return typeof raw === "boolean" ? raw : null;
}

async function seedEdgeMap(): Promise<boolean> {
  const sensors = await listDirigeraEdgeSensors();
  if (isDomainError(sensors)) {
    console.error(`[sensor-observer] seed failed: ${sensors.message}`);
    return false;
  }

  state.edgeValues.clear();
  state.edgeAttrs.clear();
  for (const sensor of sensors) {
    state.edgeAttrs.set(sensor.id, sensor.edgeAttribute);
    state.edgeValues.set(sensor.id, sensor.edgeValue);
  }
  console.log(`[sensor-observer] seeded ${sensors.length} edge sensor(s)`);
  return true;
}

function handleEvent(listenGeneration: number, updateEvent: Event): void {
  if (
    state.stopping ||
    !state.ready ||
    listenGeneration !== state.generation
  ) {
    return;
  }
  if (updateEvent.type !== "deviceStateChanged") return;
  if (!isEdgeSensorDevice(updateEvent.data)) return;

  const sensorId = updateEvent.data.id;
  const attr = state.edgeAttrs.get(sensorId);
  if (!attr) {
    const inferred: EdgeAttr =
      updateEvent.data.deviceType === "openCloseSensor"
        ? "isOpen"
        : "isDetected";
    state.edgeAttrs.set(sensorId, inferred);
    state.edgeValues.set(
      sensorId,
      readEdgeValue(updateEvent.data.attributes, inferred),
    );
    return;
  }

  const next = readEdgeValue(updateEvent.data.attributes, attr);
  if (next === null) return;

  const prev = state.edgeValues.get(sensorId);
  state.edgeValues.set(sensorId, next);

  let polarity: "rising" | "falling" | null = null;
  if (prev === false && next === true) polarity = "rising";
  else if (prev === true && next === false) polarity = "falling";
  if (!polarity) return;

  const receivedAt = new Date();
  void handleSensorEdge({
    sensorId,
    attribute: attr,
    polarity,
    receivedAt,
  })
    .then((summary) => {
      if (
        summary.rulesMatched > 0 ||
        summary.claimed > 0 ||
        summary.applied > 0
      ) {
        console.log(
          `[sensor-observer] ${polarity} sensor=${sensorId.slice(0, 8)}… ` +
            `matched=${summary.rulesMatched} claimed=${summary.claimed} ` +
            `applied=${summary.applied} skipped=${summary.skipped} failed=${summary.failed}`,
        );
      }
    })
    .catch((err) => {
      console.error(
        "[sensor-observer] handleSensorEdge failed:",
        err instanceof Error ? err.message : err,
      );
    });
}

function beginListening(client: DirigeraClient): void {
  state.generation += 1;
  const listenGeneration = state.generation;
  client.startListeningForUpdates((event) => {
    handleEvent(listenGeneration, event);
  });
  state.ready = true;
  console.log(
    `[sensor-observer] listening generation=${listenGeneration}`,
  );
}

function stopListening(client: DirigeraClient): void {
  state.ready = false;
  try {
    client.stopListeningForUpdates();
  } catch {
    // already closed
  }
}

/**
 * Start the singleton Dirigera sensor observer. Idempotent.
 */
export async function startSensorObserver(): Promise<void> {
  if (started) return;
  started = true;
  state.stopping = false;

  if (!isDirigeraConfigured()) {
    console.log("[sensor-observer] Dirigera not configured — skipped");
    return;
  }

  const client = await getDirigeraClient();
  if (!client) {
    console.log("[sensor-observer] no client — skipped");
    return;
  }
  clientRef = client;

  const ok = await seedEdgeMap();
  if (!ok) {
    console.error(
      "[sensor-observer] initial seed failed — will retry on interval",
    );
  } else {
    beginListening(client);
  }

  const recoverTimer = setInterval(() => {
    if (state.stopping || !clientRef) return;
    void (async () => {
      const c = clientRef!;
      if (state.ready) {
        try {
          await c.home();
        } catch {
          console.error(
            "[sensor-observer] hub health failed — suppressing + restart listen",
          );
          stopListening(c);
        }
        return;
      }

      const seeded = await seedEdgeMap();
      if (!seeded) return;
      clearSensorDebounceState();
      stopListening(c);
      beginListening(c);
      console.log(
        `[sensor-observer] recovered generation=${state.generation}`,
      );
    })();
  }, 60_000);

  const cleanup = () => {
    if (state.stopping) return;
    state.stopping = true;
    state.ready = false;
    clearInterval(recoverTimer);
    if (clientRef) stopListening(clientRef);
    console.log("[sensor-observer] stopped");
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}
