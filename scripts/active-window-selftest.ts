/**
 * Self-test for isWithinActiveWindow (no Dirigera / DB).
 * Usage: npx tsx scripts/active-window-selftest.ts
 */
import { isWithinActiveWindow } from "../src/domain/automations/active-window";

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

assert(isWithinActiveWindow("12:00", null, null), "null/null = all day");
assert(isWithinActiveWindow("00:00", null, null), "null/null midnight");
assert(isWithinActiveWindow("12:00", undefined, undefined), "undefined = all day");

assert(
  isWithinActiveWindow("07:00", "07:00", "22:00"),
  "inclusive from boundary",
);
assert(
  isWithinActiveWindow("22:00", "07:00", "22:00"),
  "inclusive until boundary",
);
assert(
  isWithinActiveWindow("12:30", "07:00", "22:00"),
  "midday inside day window",
);
assert(
  !isWithinActiveWindow("06:59", "07:00", "22:00"),
  "before day window",
);
assert(
  !isWithinActiveWindow("22:01", "07:00", "22:00"),
  "after day window",
);

assert(
  isWithinActiveWindow("23:00", "22:00", "06:00"),
  "overnight evening side",
);
assert(
  isWithinActiveWindow("03:00", "22:00", "06:00"),
  "overnight morning side",
);
assert(
  isWithinActiveWindow("22:00", "22:00", "06:00"),
  "overnight from boundary",
);
assert(
  isWithinActiveWindow("06:00", "22:00", "06:00"),
  "overnight until boundary",
);
assert(
  !isWithinActiveWindow("12:00", "22:00", "06:00"),
  "midday outside overnight window",
);

// Half-set at gate: treat as all day (validate rejects on write)
assert(
  isWithinActiveWindow("03:00", "07:00", null),
  "half-set from-only = all day at gate",
);

console.log("OK: active-window selftest passed");
