import { startScheduler } from "../src/core/scheduler";

console.log("[worker] Starting HomeBase background worker...");
startScheduler();

process.on("SIGINT", () => {
  console.log("[worker] Shutting down...");
  process.exit(0);
});

// Keep process alive
setInterval(() => {}, 60000);
