import { startScheduler } from "../src/core/scheduler";
import { startSensorObserver } from "../src/domain/smarthome/sensor-observer";

console.log("[worker] Starting HomeBase background worker...");
startScheduler();
void startSensorObserver().catch((err) => {
  console.error(
    "[worker] sensor observer failed to start:",
    err instanceof Error ? err.message : err,
  );
});

process.on("SIGINT", () => {
  console.log("[worker] Shutting down...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("[worker] Shutting down...");
  process.exit(0);
});

// Keep process alive
setInterval(() => {}, 60000);
