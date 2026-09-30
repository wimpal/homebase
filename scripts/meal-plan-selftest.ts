/**
 * T-118 self-test: Mon–Sun week math, date-key validation, random fill.
 * No database access. Run: npm run meal-plan:selftest
 */
import {
  columnToDateKey,
  dateKeyToColumn,
  isDateKey,
  planRandomFill,
  todayKey,
  weekDateKeys,
  weekStartKey,
} from "../src/domain/meal-plan/week";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

// todayKey — CEST rollover (UTC 22:30 on 30 Sep is already 1 Oct in Amsterdam)
assert(
  todayKey("Europe/Amsterdam", new Date("2026-09-30T22:30:00Z")) === "2026-10-01",
  "todayKey CEST rollover",
);
assert(
  todayKey("Europe/Amsterdam", new Date("2026-09-30T21:30:00Z")) === "2026-09-30",
  "todayKey still 30 Sep at 23:30 CEST",
);
assert(
  todayKey("UTC", new Date("2026-09-30T22:30:00Z")) === "2026-09-30",
  "todayKey UTC",
);

// isDateKey
assert(isDateKey("2026-09-30"), "valid key");
assert(isDateKey("2024-02-29"), "leap day");
assert(!isDateKey("2026-9-1"), "unpadded rejected");
assert(!isDateKey("2026-02-30"), "impossible day rejected");
assert(!isDateKey(""), "empty rejected");
assert(!isDateKey("2026-13-01"), "impossible month rejected");
assert(!isDateKey("not-a-date"), "garbage rejected");

// weekStartKey
assert(weekStartKey("2026-09-30") === "2026-09-28", "Wednesday -> Monday");
assert(weekStartKey("2026-09-28") === "2026-09-28", "Monday -> itself");
assert(weekStartKey("2026-10-04") === "2026-09-28", "Sunday -> previous Monday");
assert(weekStartKey("2026-09-27") === "2026-09-21", "Sunday -> back 6 days");
assert(weekStartKey("2026-01-01") === "2025-12-29", "year boundary");
assert(weekStartKey("2026-03-01") === "2026-02-23", "leap month boundary");

// weekDateKeys
{
  const keys = weekDateKeys("2026-09-28");
  assert(keys.length === 7, `expected 7 keys got ${keys.length}`);
  assert(keys[0] === "2026-09-28", "week starts Monday");
  assert(keys[6] === "2026-10-04", "week ends Sunday");
  assert(new Set(keys).size === 7, "keys are distinct");
}

// @db.Date round-trip
{
  assert(
    columnToDateKey(dateKeyToColumn("2026-10-04")) === "2026-10-04",
    "date column round-trip",
  );
}

// planRandomFill
{
  const small = planRandomFill(["d1", "d2", "d3"], ["r1", "r2"]);
  assert(small.length === 2, `library smaller -> 2 slots, got ${small.length}`);
  assert(small[0].date === "d1" && small[1].date === "d2", "date order preserved");
  assert(small[0].recipeId !== small[1].recipeId, "distinct recipes");
  assert(small.every((s) => s.recipeId === "r1" || s.recipeId === "r2"), "real ids");
}
{
  const empties = ["d1", "d2", "d3", "d4", "d5", "d6", "d7"];
  const library = Array.from({ length: 10 }, (_, i) => `r${i}`);
  const fill = planRandomFill(empties, library);
  assert(fill.length === 7, `7 empty days -> 7 slots, got ${fill.length}`);
  assert(new Set(fill.map((s) => s.recipeId)).size === 7, "unique recipes");
  assert(
    fill.every((s, i) => s.date === empties[i]),
    "date order preserved",
  );
  assert(
    fill.every((s) => library.includes(s.recipeId)),
    "only library ids used",
  );
}
assert(planRandomFill([], ["r1"]).length === 0, "nothing empty -> no slots");
assert(planRandomFill(["d1"], []).length === 0, "empty library -> no slots");
{
  // Injected rng: constant 0 makes Fisher–Yates deterministic.
  const empties = ["d1", "d2", "d3"];
  const library = ["r1", "r2", "r3"];
  const a = planRandomFill(empties, library, () => 0);
  const b = planRandomFill(empties, library, () => 0);
  assert(
    JSON.stringify(a) === JSON.stringify(b),
    "deterministic rng output",
  );
  assert(new Set(a.map((s) => s.recipeId)).size === 3, "still distinct");
}

console.log("meal-plan-selftest OK");
