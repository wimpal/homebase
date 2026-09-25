/**
 * Smoke test for Homebase MCP at /mcp (T-004 read + T-012 write + T-013 change log).
 * Requires: dev server running, SERVICE_TOKEN + MCP_HOUSEHOLD_ID in .env
 *
 * Usage:
 *   npm run mcp:smoke                              # local — lights.list + stale-id probe (T-038)
 *   npm run mcp:smoke:full                         # local — lights write smoke (pinned test device)
 *   MCP_BASE_URL=http://192.168.1.142:3000 npm run mcp:smoke   # NAS deploy — no real-lamp toggles
 *   PowerShell: $env:MCP_BASE_URL="http://192.168.1.142:3000"; npm run mcp:smoke

 * Lights write smoke (local only): HOMEBASE_SMOKE_LIGHTS_WRITE=1 + DIRIGERA_TEST_DEVICE_ID
 *
 * After each run (success or failure), deletes smoke leftovers:
 *   local MCP target  → Prisma against DATABASE_URL (+ residual verify)
 *   remote MCP target → SSH into NAS worker purge (requires NAS_HOST; residual verify in CLI)
 * Skip with HOMEBASE_SMOKE_KEEP_DATA=1. Remote cleanup failure fails the smoke.
 * Unknown MCP_HOUSEHOLD_ID (not in DB) fails purge — never silent no-op. */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPrismaClient } from "../src/core/db";
import {
  applySmokePurge,
  formatPurgeCounts,
  residualSmokeCount,
  totalPurgeCounts,
} from "./lib/purge-smoke";

function loadDotEnv() {
  if (process.env.HOMEBASE_SMOKE_SKIP_DOTENV === "1") {
    return;
  }
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

loadDotEnv();

if (process.argv.includes("--lights-write")) {
  process.env.HOMEBASE_SMOKE_LIGHTS_WRITE = "1";
}

const BASE_URL = process.env.MCP_BASE_URL ?? "http://127.0.0.1:3000";
const TOKEN = process.env.SERVICE_TOKEN?.trim();
const HOUSEHOLD_ID = process.env.MCP_HOUSEHOLD_ID?.trim();

function isLocalMcpTarget(baseUrl: string): boolean {
  try {
    let host = new URL(baseUrl).hostname.toLowerCase();
    // Node may return bracketed IPv6 literals (e.g. "[::1]").
    if (host.startsWith("[") && host.endsWith("]")) {
      host = host.slice(1, -1);
    }
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

const IS_LOCAL = isLocalMcpTarget(BASE_URL);

type ToolResult = {
  isError?: boolean;
  content?: { type: string; text: string }[];
};

/** Keep-alive sockets go stale across long SSH/docker gaps → ECONNRESET. */
function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientFetchError(err: unknown): boolean {
  const codes = new Set([
    "ECONNRESET",
    "ECONNREFUSED",
    "EPIPE",
    "ETIMEDOUT",
    "EHOSTUNREACH",
    "ENETUNREACH",
    "UND_ERR_SOCKET",
    "UND_ERR_CONNECT_TIMEOUT",
  ]);
  let cur: unknown = err;
  for (let depth = 0; depth < 4 && cur; depth++) {
    if (cur instanceof Error) {
      const code = (cur as NodeJS.ErrnoException).code;
      if (code && codes.has(code)) return true;
      const msg = cur.message.toLowerCase();
      if (
        msg.includes("fetch failed") ||
        msg.includes("econnreset") ||
        msg.includes("socket hang up") ||
        msg.includes("other side closed")
      ) {
        return true;
      }
      cur = cur.cause;
      continue;
    }
    break;
  }
  return false;
}

async function mcpPost(
  body: string,
  token?: string,
): Promise<{ status: number; body: string }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const maxAttempts = 4;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(`${BASE_URL}/mcp`, {
        method: "POST",
        headers,
        body,
      });
      const text = await res.text();
      return { status: res.status, body: text };
    } catch (err) {
      lastErr = err;
      if (!isTransientFetchError(err) || attempt === maxAttempts) {
        throw err;
      }
      const delayMs = 250 * 2 ** (attempt - 1);
      console.log(
        `NOTE: MCP fetch transient error (attempt ${attempt}/${maxAttempts}), retry in ${delayMs}ms`,
      );
      await sleepMs(delayMs);
    }
  }
  throw lastErr;
}

function parseJson(body: string): unknown {
  return JSON.parse(body);
}

function fail(message: string): never {
  throw new Error(`FAIL: ${message}`);
}

function ok(message: string) {
  console.log(`OK: ${message}`);
}

function parseToolPayload(result: ToolResult | undefined): unknown {
  const text = result?.content?.[0]?.text;
  if (!text) {
    fail("tool result missing content text");
  }
  return parseJson(text);
}

async function callTool(
  id: number,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const { status, body } = await mcpPost(
    JSON.stringify({
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: { name, arguments: args },
    }),
    TOKEN,
  );
  if (status !== 200) {
    fail(`${name} failed (${status}): ${body}`);
  }
  const json = parseJson(body) as { result?: ToolResult };
  return json.result ?? {};
}

async function ensureLocalShoppingPrereqs() {
  const prisma = createPrismaClient();
  try {
    const household = await prisma.household.findUnique({
      where: { id: HOUSEHOLD_ID! },
    });
    if (!household) {
      const demo = await prisma.household.findFirst({ orderBy: { createdAt: "asc" } });
      fail(
        `MCP_HOUSEHOLD_ID is not in the database. Run npm run db:seed and set MCP_HOUSEHOLD_ID=${demo?.id ?? "<household-id>"} in .env (server must restart).`,
      );
    }
    const list = await prisma.shoppingList.findFirst({
      where: { householdId: HOUSEHOLD_ID! },
    });
    if (!list) {
      await prisma.shoppingList.create({
        data: { householdId: HOUSEHOLD_ID!, name: "Shopping List" },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  if (!TOKEN) {
    fail("SERVICE_TOKEN is not set in the environment");
  }
  if (!HOUSEHOLD_ID) {
    fail("MCP_HOUSEHOLD_ID is not set in the environment");
  }

  const { status: noAuthStatus } = await mcpPost(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "mcp-smoke", version: "1.0" },
      },
    }),
  );
  if (noAuthStatus !== 401) {
    fail(`expected 401 without token, got ${noAuthStatus}`);
  }
  ok("rejects missing bearer token");

  const initBody = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "mcp-smoke", version: "1.0" },
    },
  });

  const { status: initStatus, body: initRes } = await mcpPost(initBody, TOKEN);
  if (initStatus !== 200) {
    const hint =
      initStatus === 401
        ? " (check SERVICE_TOKEN matches the server's .env — NAS deploy uses the share .env, not only local dev .env)"
        : "";
    fail(`initialize failed (${initStatus})${hint}: ${initRes}`);
  }
  const initJson = parseJson(initRes) as { result?: unknown };
  if (!initJson.result) {
    fail(`initialize missing result: ${initRes}`);
  }
  ok("initialize");

  if (IS_LOCAL) {
    await ensureLocalShoppingPrereqs();
  }

  await mcpPost(
    JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    TOKEN,
  );

  const { status: listStatus, body: listRes } = await mcpPost(
    JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
    TOKEN,
  );
  if (listStatus !== 200) {
    fail(`tools/list failed (${listStatus}): ${listRes}`);
  }
  const listJson = parseJson(listRes) as {
    result?: { tools?: { name: string }[] };
  };
  const tools = listJson.result?.tools ?? [];
  const names = tools.map((t) => t.name).sort();
  const expected = [
    "homebase.changes.list",
    "homebase.changes.revert",
    "homebase.devices.add",
    "homebase.devices.get",
    "homebase.devices.go_home",
    "homebase.devices.launch_app",
    "homebase.devices.list",
    "homebase.devices.power_off",
    "homebase.devices.remove",
    "homebase.devices.set_input",
    "homebase.devices.update",
    "homebase.devices.wake",
    "homebase.inventory.get",
    "homebase.inventory.list",
    "homebase.inventory.update",
    "homebase.lights.list",
    "homebase.lights.party_mode",
    "homebase.lights.set_state",
    "homebase.protocols.list",
    "homebase.protocols.run",
    "homebase.recipes.add",
    "homebase.recipes.get",
    "homebase.recipes.search",
    "homebase.recipes.update",
    "homebase.shopping_list.add_item",
    "homebase.shopping_list.complete_item",
    "homebase.shopping_list.list",
    "homebase.tasks.add",
    "homebase.tasks.complete",
    "homebase.tasks.list",
  ];
  if (names.length !== 30 || !expected.every((n) => names.includes(n))) {
    fail(`expected tools ${expected.join(", ")}, got ${names.join(", ")}`);
  }
  ok("tools/list returns exactly 30 homebase tools");

  const invListResult = await callTool(3, "homebase.inventory.list", {
    low_stock_only: true,
  });
  if (invListResult.isError) {
    fail("homebase.inventory.list tool error");
  }
  ok("homebase.inventory.list (low_stock_only)");

  const shopListResult = await callTool(4, "homebase.shopping_list.list", {});
  if (shopListResult.isError) {
    fail(
      `homebase.shopping_list.list tool error: ${shopListResult.content?.[0]?.text ?? "unknown"}`,
    );
  }
  ok("homebase.shopping_list.list");

  const smokeItemName = `mcp-smoke-${Date.now()}`;
  const addResult = await callTool(5, "homebase.shopping_list.add_item", {
    name: smokeItemName,
    quantity: 2,
  });
  if (addResult.isError) {
    fail("homebase.shopping_list.add_item tool error");
  }
  const added = parseToolPayload(addResult) as {
    change_id: string;
    id: string;
    name: string;
    quantity: number;
  };
  if (!added.change_id) {
    fail("add_item missing change_id");
  }
  if (added.name !== smokeItemName || added.quantity !== 2) {
    fail(`add_item returned unexpected payload: ${JSON.stringify(added)}`);
  }

  const addDupResult = await callTool(51, "homebase.shopping_list.add_item", {
    name: smokeItemName,
    quantity: 2,
  });
  if (addDupResult.isError) {
    fail("shopping_list.add_item dedupe call tool error");
  }
  const dupAdded = parseToolPayload(addDupResult) as {
    id: string;
    quantity: number;
  };
  if (dupAdded.id !== added.id || dupAdded.quantity !== 4) {
    fail(
      `dedupe add_item expected same id qty 4, got ${JSON.stringify(dupAdded)}`,
    );
  }

  const shopAfterAdd = await callTool(6, "homebase.shopping_list.list", {});
  if (shopAfterAdd.isError) {
    fail("shopping_list.list after add_item failed");
  }
  const shopItems = parseToolPayload(shopAfterAdd) as { name: string; id: string }[];
  const matches = shopItems.filter((item) => item.name === smokeItemName);
  if (matches.length !== 1) {
    fail(`expected one list row for ${smokeItemName}, got ${matches.length}`);
  }

  const completeResult = await callTool(52, "homebase.shopping_list.complete_item", {
    id: added.id,
  });
  if (completeResult.isError) {
    fail("homebase.shopping_list.complete_item tool error");
  }
  const completed = parseToolPayload(completeResult) as { checked: boolean };
  if (!completed.checked) {
    fail("complete_item should return checked true");
  }
  const shopAfterComplete = await callTool(53, "homebase.shopping_list.list", {});
  const afterCompleteItems = parseToolPayload(shopAfterComplete) as { name: string }[];
  if (afterCompleteItems.some((item) => item.name === smokeItemName)) {
    fail("completed item still on needed list");
  }
  ok("shopping_list dedupe + complete_item");

  const revertItemName = `mcp-smoke-revert-${Date.now()}`;
  const addForRevert = await callTool(54, "homebase.shopping_list.add_item", {
    name: revertItemName,
    quantity: 1,
  });
  if (addForRevert.isError) {
    fail("add_item for revert test tool error");
  }
  const addedRevert = parseToolPayload(addForRevert) as {
    change_id: string;
    id: string;
    name: string;
  };
  if (!addedRevert.change_id) {
    fail("add_item for revert missing change_id");
  }

  const changesAfterAdd = await callTool(7, "homebase.changes.list", {
    limit: 10,
  });
  if (changesAfterAdd.isError) {
    fail("changes.list after add_item failed");
  }
  const changeRows = parseToolPayload(changesAfterAdd) as {
    change_id: string;
  }[];
  if (!changeRows.some((row) => row.change_id === addedRevert.change_id)) {
    fail("change log missing add_item entry");
  }

  const revertedAdd = await callTool(8, "homebase.changes.revert", {
    change_id: addedRevert.change_id,
  });
  if (revertedAdd.isError) {
    fail("changes.revert (add_item) tool error");
  }
  const revertPayload = parseToolPayload(revertedAdd) as {
    change_id: string;
    reverted_at?: string;
  };
  if (revertPayload.change_id !== addedRevert.change_id || !revertPayload.reverted_at) {
    fail(`unexpected revert payload: ${JSON.stringify(revertPayload)}`);
  }

  const shopAfterRevert = await callTool(9, "homebase.shopping_list.list", {});
  const shopAfterRevertItems = parseToolPayload(shopAfterRevert) as {
    name: string;
  }[];
  if (shopAfterRevertItems.some((item) => item.name === revertItemName)) {
    fail("shopping item still on list after revert");
  }

  const doubleRevert = await callTool(10, "homebase.changes.revert", {
    change_id: addedRevert.change_id,
  });
  if (!doubleRevert.isError) {
    fail("expected invalid_input on second revert");
  }
  ok("add_item → changes.list → revert round-trip");

  if (IS_LOCAL) {
    await runInventoryUpdateSmokeLocal(callTool);
  } else {
    await runInventoryUpdateSmokeRemote(callTool);
  }

  function formatDate(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  const dueBefore = new Date();
  dueBefore.setDate(dueBefore.getDate() + 7);
  const tasksListResult = await callTool(16, "homebase.tasks.list", {
    due_before: formatDate(dueBefore),
  });
  if (tasksListResult.isError) {
    fail("homebase.tasks.list tool error");
  }
  ok("homebase.tasks.list");

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const smokeTaskTitle = `mcp-smoke-task-${Date.now()}`;
  const taskAddResult = await callTool(17, "homebase.tasks.add", {
    title: smokeTaskTitle,
    due: formatDate(tomorrow),
  });
  if (taskAddResult.isError) {
    fail("homebase.tasks.add tool error");
  }
  const addedTask = parseToolPayload(taskAddResult) as {
    id: string;
    title: string;
    due: string | null;
  };
  if (addedTask.title !== smokeTaskTitle) {
    fail(`tasks.add returned unexpected title: ${JSON.stringify(addedTask)}`);
  }

  const tasksAfterAdd = await callTool(18, "homebase.tasks.list", {
    due_before: formatDate(tomorrow),
  });
  const taskRows = parseToolPayload(tasksAfterAdd) as { title: string }[];
  if (!taskRows.some((row) => row.title === smokeTaskTitle)) {
    fail(`added task ${smokeTaskTitle} not found in tasks.list`);
  }

  const taskCompleteResult = await callTool(19, "homebase.tasks.complete", {
    id: addedTask.id,
  });
  if (taskCompleteResult.isError) {
    fail("homebase.tasks.complete tool error");
  }

  const tasksAfterOneOffComplete = await callTool(24, "homebase.tasks.list", {});
  const afterOneOff = parseToolPayload(tasksAfterOneOffComplete) as { title: string }[];
  if (afterOneOff.some((row) => row.title === smokeTaskTitle)) {
    fail("one-off task still in active list after complete");
  }
  ok("tasks add → list → complete round-trip");

  const recurringAdd = await callTool(20, "homebase.tasks.add", {
    title: `mcp-smoke-recurring-${Date.now()}`,
    recurrence: "weekly",
  });
  if (recurringAdd.isError) {
    fail("homebase.tasks.add (recurring) tool error");
  }
  const recurringTask = parseToolPayload(recurringAdd) as {
    id: string;
    title: string;
    recurrence: string | null;
  };
  if (recurringTask.recurrence !== "every 7 days") {
    fail(`expected weekly recurrence, got ${recurringTask.recurrence}`);
  }

  const recurringComplete = await callTool(21, "homebase.tasks.complete", {
    id: recurringTask.id,
  });
  if (recurringComplete.isError) {
    fail("homebase.tasks.complete (recurring) tool error");
  }
  const completedRecurring = parseToolPayload(recurringComplete) as {
    due: string | null;
  };
  if (!completedRecurring.due) {
    fail("recurring task missing rolled nextDue after complete");
  }

  const tasksAfterRecurringComplete = await callTool(25, "homebase.tasks.list", {});
  const afterRecurring = parseToolPayload(tasksAfterRecurringComplete) as {
    title: string;
  }[];
  if (afterRecurring.some((row) => row.title === recurringTask.title)) {
    fail("recurring task still in active list before next due");
  }
  ok("recurring tasks.complete rolls nextDue and hides until next due");

  const recipeSearchResult = await callTool(22, "homebase.recipes.search", {});
  if (recipeSearchResult.isError) {
    fail("homebase.recipes.search tool error");
  }
  const recipeHits = parseToolPayload(recipeSearchResult) as { id: string }[];
  if (recipeHits.length > 0) {
    const recipeGetResult = await callTool(23, "homebase.recipes.get", {
      id: recipeHits[0].id,
    });
    if (recipeGetResult.isError) {
      fail("homebase.recipes.get tool error");
    }
    const recipeDetail = parseToolPayload(recipeGetResult) as {
      steps: string[];
      instructions: string;
    };
    if (!Array.isArray(recipeDetail.steps)) {
      fail("recipes.get missing steps array");
    }
    ok("recipes search → get round-trip");
  } else {
    console.log("NOTE: household has no recipes — search/get skipped");
    ok("homebase.recipes.search (no matches in household)");
  }

  const smokeRecipeTitle = `Smoke Add ${Date.now()}`;
  const smokeSteps = [
    "Mix flour, milk and eggs into a smooth batter.",
    "Heat a lightly oiled pan over medium heat.",
    "Pour a ladle of batter, cook until golden, flip once.",
  ];
  const recipeAddResult = await callTool(24, "homebase.recipes.add", {
    title: smokeRecipeTitle,
    servings: 4,
    ingredients: [
      { name: "flour", quantity: "250 g" },
      { name: "milk", quantity: "500 ml" },
      { name: "egg", quantity: "2" },
    ],
    steps: smokeSteps,
  });
  if (recipeAddResult.isError) {
    fail("homebase.recipes.add tool error");
  }
  const addedRecipe = parseToolPayload(recipeAddResult) as {
    id: string;
    name: string;
    steps: string[];
    ingredients: { name: string; quantity: string }[];
  };
  if (addedRecipe.name !== smokeRecipeTitle) {
    fail(`recipes.add unexpected name: ${JSON.stringify(addedRecipe)}`);
  }
  if (
    !Array.isArray(addedRecipe.steps) ||
    addedRecipe.steps.length !== smokeSteps.length ||
    addedRecipe.steps.some((s, i) => s !== smokeSteps[i])
  ) {
    fail(`recipes.add steps mismatch: ${JSON.stringify(addedRecipe.steps)}`);
  }
  ok("homebase.recipes.add");

  const recipeGetAdded = await callTool(25, "homebase.recipes.get", {
    id: addedRecipe.id,
  });
  if (recipeGetAdded.isError) {
    fail("homebase.recipes.get after add tool error");
  }
  const gotAdded = parseToolPayload(recipeGetAdded) as {
    id: string;
    steps: string[];
  };
  if (
    gotAdded.id !== addedRecipe.id ||
    !Array.isArray(gotAdded.steps) ||
    gotAdded.steps.length !== smokeSteps.length ||
    gotAdded.steps.some((s, i) => s !== smokeSteps[i])
  ) {
    fail(`recipes.get after add steps mismatch: ${JSON.stringify(gotAdded)}`);
  }
  ok("recipes.add → get steps round-trip");

  const recipeSearchAdded = await callTool(26, "homebase.recipes.search", {
    query: smokeRecipeTitle,
  });
  if (recipeSearchAdded.isError) {
    fail("homebase.recipes.search after add tool error");
  }
  const searchAfterAdd = parseToolPayload(recipeSearchAdded) as {
    id: string;
    name: string;
  }[];
  if (!searchAfterAdd.some((r) => r.id === addedRecipe.id)) {
    fail(`recipes.search did not find added title ${smokeRecipeTitle}`);
  }
  ok("recipes.search finds added recipe");

  const recipeDupResult = await callTool(27, "homebase.recipes.add", {
    title: smokeRecipeTitle,
    ingredients: [{ name: "flour", quantity: "1 cup" }],
    steps: ["Do not overwrite."],
  });
  if (!recipeDupResult.isError) {
    fail("expected conflict on duplicate recipe title");
  }
  const dupPayload = parseToolPayload(recipeDupResult) as {
    error?: { message?: string; code?: string };
  };
  if (dupPayload.error?.message !== "Recipe title already exists") {
    fail(
      `expected Recipe title already exists, got ${JSON.stringify(dupPayload)}`,
    );
  }
  ok("recipes.add rejects duplicate title");

  const groupRecipeTitle = `Smoke Add ${Date.now()}-groups`;
  const groupIngredients = [
    { name: "pasta", quantity: "300 gr" },
    { name: "kip", quantity: "400 gr" },
    { name: "Griekse yoghurt", quantity: "100 gr", group: "dressing" },
    { name: "mayonaise", quantity: "2 el", group: "dressing" },
  ];
  const groupAddResult = await callTool(28, "homebase.recipes.add", {
    title: groupRecipeTitle,
    servings: 4,
    ingredients: groupIngredients,
    steps: ["Cook pasta.", "Mix dressing.", "Combine and serve."],
  });
  if (groupAddResult.isError) {
    fail(
      `homebase.recipes.add with groups tool error: ${groupAddResult.content?.[0]?.text ?? "unknown"}`,
    );
  }
  const groupAdded = parseToolPayload(groupAddResult) as {
    id: string;
    ingredients: { name: string; quantity: string; group?: string }[];
  };
  const groupGetResult = await callTool(29, "homebase.recipes.get", {
    id: groupAdded.id,
  });
  if (groupGetResult.isError) {
    fail("homebase.recipes.get after group add tool error");
  }
  const groupGot = parseToolPayload(groupGetResult) as {
    ingredients: { name: string; quantity: string; group?: string }[];
  };
  if (
    !Array.isArray(groupGot.ingredients) ||
    groupGot.ingredients.length !== groupIngredients.length
  ) {
    fail(
      `group get ingredient count mismatch: ${JSON.stringify(groupGot.ingredients)}`,
    );
  }
  for (let i = 0; i < groupIngredients.length; i++) {
    const expected = groupIngredients[i];
    const actual = groupGot.ingredients[i];
    if (actual.name !== expected.name || actual.quantity !== expected.quantity) {
      fail(
        `group get order/name mismatch at ${i}: ${JSON.stringify(actual)}`,
      );
    }
    if (expected.group) {
      if (actual.group !== expected.group) {
        fail(
          `expected group "${expected.group}" at ${i}, got ${JSON.stringify(actual)}`,
        );
      }
    } else if (actual.group) {
      fail(`main ingredient at ${i} should omit group: ${JSON.stringify(actual)}`);
    }
  }
  ok("recipes.add → get ingredient group round-trip");

  // T-106: tags, calories, optional ingredient, search by tag, update
  const taggedTitle = `Smoke Add ${Date.now()}-tags`;
  const taggedAddResult = await callTool(30, "homebase.recipes.add", {
    title: taggedTitle,
    servings: 2,
    ingredients: [
      { name: "pasta", quantity: "200 g" },
      { name: "chili flakes", quantity: "1 tsp", optional: true },
    ],
    steps: ["Boil pasta.", "Toss with oil.", "Add chili if desired."],
    step_optional: [false, false, true],
    tags: ["Lunch", " quick "],
    calories: 450,
    protein_g: 12,
  });
  if (taggedAddResult.isError) {
    fail(
      `homebase.recipes.add with tags tool error: ${taggedAddResult.content?.[0]?.text ?? "unknown"}`,
    );
  }
  const taggedAdded = parseToolPayload(taggedAddResult) as {
    id: string;
    name: string;
    tags: string[];
    calories?: number;
    protein_g?: number;
    ingredients: { name: string; optional?: boolean }[];
    step_optional?: boolean[];
  };
  if (
    !Array.isArray(taggedAdded.tags) ||
    !taggedAdded.tags.includes("lunch") ||
    !taggedAdded.tags.includes("quick")
  ) {
    fail(`expected normalized tags, got ${JSON.stringify(taggedAdded.tags)}`);
  }
  if (taggedAdded.calories !== 450 || taggedAdded.protein_g !== 12) {
    fail(`expected nutrition on add return: ${JSON.stringify(taggedAdded)}`);
  }
  const optionalIng = taggedAdded.ingredients.find(
    (i) => i.name === "chili flakes",
  );
  if (!optionalIng?.optional) {
    fail(`expected optional chili flakes: ${JSON.stringify(taggedAdded.ingredients)}`);
  }
  if (
    !Array.isArray(taggedAdded.step_optional) ||
    taggedAdded.step_optional[2] !== true
  ) {
    fail(`expected step_optional[2]=true: ${JSON.stringify(taggedAdded.step_optional)}`);
  }
  ok("recipes.add with tags, calories, optional ingredient/step");

  const tagSearchResult = await callTool(31, "homebase.recipes.search", {
    tags: ["lunch"],
  });
  if (tagSearchResult.isError) {
    fail("homebase.recipes.search by tag tool error");
  }
  const tagHits = parseToolPayload(tagSearchResult) as {
    id: string;
    tags: string[];
    calories?: number;
  }[];
  if (!tagHits.some((r) => r.id === taggedAdded.id)) {
    fail(`search by tag lunch did not find ${taggedTitle}`);
  }
  const tagHit = tagHits.find((r) => r.id === taggedAdded.id)!;
  if (tagHit.calories !== 450) {
    fail(`search summary missing calories: ${JSON.stringify(tagHit)}`);
  }
  ok("recipes.search by tag returns card fields");

  const updateResult = await callTool(32, "homebase.recipes.update", {
    id: taggedAdded.id,
    title: taggedTitle,
    servings: 3,
    ingredients: [
      { name: "pasta", quantity: "250 g" },
      { name: "chili flakes", quantity: "1 tsp", optional: true },
      { name: "parmesan", quantity: "30 g" },
    ],
    steps: ["Boil pasta.", "Toss with oil and cheese."],
    tags: ["lunch", "dinner"],
    calories: 500,
    timers: [{ label: "boil", minutes: 10 }],
  });
  if (updateResult.isError) {
    fail(
      `homebase.recipes.update tool error: ${updateResult.content?.[0]?.text ?? "unknown"}`,
    );
  }
  const updated = parseToolPayload(updateResult) as {
    id: string;
    servings: number;
    tags: string[];
    calories?: number;
    ingredients: { name: string }[];
    steps: string[];
  };
  if (
    updated.servings !== 3 ||
    updated.calories !== 500 ||
    !updated.tags.includes("dinner") ||
    updated.ingredients.length !== 3 ||
    updated.steps.length !== 2
  ) {
    fail(`recipes.update unexpected payload: ${JSON.stringify(updated)}`);
  }
  ok("homebase.recipes.update full-replace");

  const updateGet = await callTool(33, "homebase.recipes.get", {
    id: taggedAdded.id,
  });
  if (updateGet.isError) {
    fail("homebase.recipes.get after update tool error");
  }
  const gotUpdated = parseToolPayload(updateGet) as {
    servings: number;
    tags: string[];
    calories?: number;
    protein_g?: number;
  };
  if (
    gotUpdated.servings !== 3 ||
    gotUpdated.calories !== 500 ||
    gotUpdated.protein_g != null
  ) {
    fail(
      `get after update: cleared protein_g expected, got ${JSON.stringify(gotUpdated)}`,
    );
  }
  ok("recipes.update → get (nutrition omit clears)");

  // --- T-108 Network devices ---
  function assertNoMac(payload: unknown, label: string) {
    const text = JSON.stringify(payload);
    if (
      /"mac"/i.test(text) ||
      /mac_address/i.test(text) ||
      /macAddress/.test(text) ||
      /ssapClientKey/.test(text) ||
      /ssap_client_key/.test(text) ||
      /"client-key"/i.test(text) ||
      /lastSeenIp/.test(text) ||
      /lastSeenHostname/.test(text) ||
      /lastSeenAt/.test(text) ||
      /last_seen_ip/.test(text) ||
      /last_seen_hostname/.test(text) ||
      /last_seen_at/.test(text)
    ) {
      fail(`${label}: identity/MAC/SSAP-key leak in payload: ${text}`);
    }
  }

  const deviceName = `Smoke Add Device ${Date.now()}`;
  const deviceAdd = await callTool(34, "homebase.devices.add", {
    name: deviceName,
    type: "nas",
    location: "unknown",
    notes: "mcp-smoke",
  });
  if (deviceAdd.isError) {
    fail(
      `homebase.devices.add tool error: ${deviceAdd.content?.[0]?.text ?? "unknown"}`,
    );
  }
  const addedDevice = parseToolPayload(deviceAdd) as {
    id: string;
    name: string;
    type: { slug: string };
    location: { slug: string };
    notes?: string;
  };
  if (
    !addedDevice.id ||
    addedDevice.name !== deviceName ||
    addedDevice.type?.slug !== "nas" ||
    addedDevice.location?.slug !== "unknown"
  ) {
    fail(`devices.add unexpected: ${JSON.stringify(addedDevice)}`);
  }
  assertNoMac(addedDevice, "devices.add");
  ok("homebase.devices.add");

  const deviceDup = await callTool(35, "homebase.devices.add", {
    name: deviceName,
    type: "nas",
    location: "portable",
  });
  if (deviceDup.isError) {
    fail(
      `homebase.devices.add duplicate tool error: ${deviceDup.content?.[0]?.text ?? "unknown"}`,
    );
  }
  const dupDevice = parseToolPayload(deviceDup) as { id: string; name: string };
  if (dupDevice.name !== `${deviceName} (2)`) {
    fail(`expected auto-suffix Name (2), got ${JSON.stringify(dupDevice)}`);
  }
  assertNoMac(dupDevice, "devices.add dup");
  ok("homebase.devices.add auto-suffix duplicate");

  const deviceGet = await callTool(36, "homebase.devices.get", {
    id: addedDevice.id,
  });
  if (deviceGet.isError) {
    fail("homebase.devices.get tool error");
  }
  const gotDevice = parseToolPayload(deviceGet) as { id: string };
  if (gotDevice.id !== addedDevice.id) {
    fail(`devices.get mismatch: ${JSON.stringify(gotDevice)}`);
  }
  assertNoMac(gotDevice, "devices.get");
  ok("homebase.devices.get");

  const deviceList = await callTool(37, "homebase.devices.list", {
    type: "nas",
  });
  if (deviceList.isError) {
    fail("homebase.devices.list tool error");
  }
  const listed = parseToolPayload(deviceList) as { id: string; name: string }[];
  if (!Array.isArray(listed) || !listed.some((d) => d.id === addedDevice.id)) {
    fail(`devices.list missing added device: ${JSON.stringify(listed)}`);
  }
  assertNoMac(listed, "devices.list");
  ok("homebase.devices.list");

  const deviceUpdate = await callTool(38, "homebase.devices.update", {
    id: addedDevice.id,
    notes: "mcp-smoke updated",
    location: "portable",
  });
  if (deviceUpdate.isError) {
    fail(
      `homebase.devices.update tool error: ${deviceUpdate.content?.[0]?.text ?? "unknown"}`,
    );
  }
  const updatedDevice = parseToolPayload(deviceUpdate) as {
    notes?: string;
    location: { slug: string };
  };
  if (
    updatedDevice.notes !== "mcp-smoke updated" ||
    updatedDevice.location?.slug !== "portable"
  ) {
    fail(`devices.update unexpected: ${JSON.stringify(updatedDevice)}`);
  }
  assertNoMac(updatedDevice, "devices.update");
  ok("homebase.devices.update patch");

  const deviceRemove = await callTool(39, "homebase.devices.remove", {
    id: addedDevice.id,
  });
  if (deviceRemove.isError) {
    fail(
      `homebase.devices.remove tool error: ${deviceRemove.content?.[0]?.text ?? "unknown"}`,
    );
  }
  const retiredDevice = parseToolPayload(deviceRemove) as {
    retired_at?: string;
  };
  if (!retiredDevice.retired_at) {
    fail(`devices.remove expected retired_at: ${JSON.stringify(retiredDevice)}`);
  }
  assertNoMac(retiredDevice, "devices.remove");
  ok("homebase.devices.remove soft-retire");

  const listActive = await callTool(40, "homebase.devices.list", {});
  if (listActive.isError) fail("devices.list after retire tool error");
  const activeList = parseToolPayload(listActive) as { id: string }[];
  if (activeList.some((d) => d.id === addedDevice.id)) {
    fail("retired device still in default list");
  }
  ok("devices.list hides retired by default");

  const listRetired = await callTool(41, "homebase.devices.list", {
    include_retired: true,
  });
  if (listRetired.isError) fail("devices.list include_retired tool error");
  const retiredList = parseToolPayload(listRetired) as { id: string }[];
  if (!retiredList.some((d) => d.id === addedDevice.id)) {
    fail("include_retired missing retired device");
  }
  ok("devices.list include_retired");

  const unknownGet = await callTool(42, "homebase.devices.get", {
    id: "nonexistent-device-id",
  });
  if (!unknownGet.isError) {
    fail("devices.get unknown id should be error");
  }
  ok("homebase.devices.get unknown id refused");

  // --- T-101 Wake-on-LAN ---
  // Remote seed uses SSH + docker exec (~10–20s). mcpPost retries cover the
  // post-gap ECONNRESET from a stale keep-alive socket.
  const wolFixtures = await seedWolSmokeFixtures();
  assertNoMac(wolFixtures, "wol fixtures meta");
  ok("wol smoke fixtures seeded");

  const listWake = await callTool(43, "homebase.devices.list", {});
  if (listWake.isError) fail("devices.list before wake tool error");
  const wakeListed = parseToolPayload(listWake) as {
    id: string;
    wake_capable?: boolean;
  }[];
  const capableRow = wakeListed.find((d) => d.id === wolFixtures.allowlisted_id);
  if (!capableRow || capableRow.wake_capable !== true) {
    fail(
      `allowlisted fixture should be wake_capable: ${JSON.stringify(capableRow)}`,
    );
  }
  assertNoMac(wakeListed, "devices.list wake_capable");
  ok("devices.list wake_capable true for allowlisted");

  const wakeOk = await callTool(44, "homebase.devices.wake", {
    device_id: wolFixtures.allowlisted_id,
  });
  if (wakeOk.isError) {
    fail(
      `homebase.devices.wake tool error: ${wakeOk.content?.[0]?.text ?? "unknown"}`,
    );
  }
  const woke = parseToolPayload(wakeOk) as {
    id: string;
    name: string;
    status: string;
  };
  if (
    woke.id !== wolFixtures.allowlisted_id ||
    (woke.status !== "sent" && woke.status !== "dry_run")
  ) {
    fail(`devices.wake unexpected: ${JSON.stringify(woke)}`);
  }
  assertNoMac(woke, "devices.wake");
  ok(`homebase.devices.wake (${woke.status})`);

  const wakeRate = await callTool(45, "homebase.devices.wake", {
    device_id: wolFixtures.allowlisted_id,
  });
  if (!wakeRate.isError) {
    fail("devices.wake rapid repeat should be rate-limited");
  }
  assertNoMac(parseToolPayload(wakeRate), "devices.wake rate-limit error");
  ok("homebase.devices.wake rate-limited");

  const wakeDeny = await callTool(46, "homebase.devices.wake", {
    device_id: wolFixtures.not_allowed_id,
  });
  if (!wakeDeny.isError) {
    fail("devices.wake non-allowlisted should fail");
  }
  assertNoMac(parseToolPayload(wakeDeny), "devices.wake deny error");
  ok("homebase.devices.wake non-allowlisted refused");

  const wakeRetired = await callTool(47, "homebase.devices.wake", {
    device_id: wolFixtures.retired_id,
  });
  if (!wakeRetired.isError) {
    fail("devices.wake retired should fail");
  }
  assertNoMac(parseToolPayload(wakeRetired), "devices.wake retired error");
  ok("homebase.devices.wake retired refused");

  const wakeForged = await callTool(48, "homebase.devices.wake", {
    device_id: wolFixtures.allowlisted_id,
    mac: "aa:bb:cc:dd:ee:ff",
    mac_address: "aa:bb:cc:dd:ee:ff",
  } as Record<string, unknown>);
  // Extra keys ignored by Zod; still rate-limited from prior wake — either
  // rate-limit or (if cooldown cleared) would still not accept MAC as target.
  if (!wakeForged.isError) {
    const forgedPayload = parseToolPayload(wakeForged);
    assertNoMac(forgedPayload, "devices.wake forged mac args");
  } else {
    assertNoMac(parseToolPayload(wakeForged), "devices.wake forged error");
  }
  ok("homebase.devices.wake forged MAC args ignored / no MAC leak");

  // --- T-112 webOS SSAP ---
  // Remote seed via SSH (same as WoL) — never Prisma against local DB when
  // MCP target is NAS.
  const ssapFixtures = await seedSsapSmokeFixtures();
  assertNoMac(ssapFixtures, "ssap fixtures meta");
  ok("ssap smoke fixtures seeded");

  const goUnpaired = await callTool(49, "homebase.devices.go_home", {
    device_id: ssapFixtures.unpaired_id,
  });
  if (!goUnpaired.isError) {
    fail("devices.go_home unpaired should fail");
  }
  assertNoMac(parseToolPayload(goUnpaired), "devices.go_home unpaired error");
  ok("homebase.devices.go_home unpaired refused");

  const launchUnset = await callTool(50, "homebase.devices.launch_app", {
    device_id: ssapFixtures.paired_dry_id,
    target: "jellyfin",
  });
  if (!launchUnset.isError) {
    fail("devices.launch_app jellyfin without app id should fail");
  }
  assertNoMac(
    parseToolPayload(launchUnset),
    "devices.launch_app unset jellyfin error",
  );
  ok("homebase.devices.launch_app jellyfin unset refused");

  const goForgedKey = await callTool(51, "homebase.devices.go_home", {
    device_id: ssapFixtures.paired_dry_id,
    client_key: "forged-secret",
    ssapClientKey: "forged-secret",
  } as Record<string, unknown>);
  // Extra keys ignored; may succeed (dry-run server) or fail unreachable — never leak key.
  assertNoMac(
    parseToolPayload(goForgedKey),
    "devices.go_home forged key args",
  );
  ok("homebase.devices.go_home forged key args ignored / no key leak");

  const badInput = await callTool(52, "homebase.devices.set_input", {
    device_id: ssapFixtures.paired_dry_id,
    input: "hdmi9",
  } as Record<string, unknown>);
  if (!badInput.isError) {
    fail("devices.set_input invalid enum should fail");
  }
  const badInputPayload = parseToolPayload(badInput) as {
    error?: { code?: string };
  };
  if (badInputPayload.error?.code !== "invalid_input") {
    fail(
      `devices.set_input invalid expected invalid_input, got ${JSON.stringify(badInputPayload)}`,
    );
  }
  assertNoMac(badInputPayload, "devices.set_input invalid");
  ok("homebase.devices.set_input invalid input refused");

  // --- T-113 SSAP power_off ---
  const powerOffUnpaired = await callTool(54, "homebase.devices.power_off", {
    device_id: ssapFixtures.unpaired_id,
  });
  if (!powerOffUnpaired.isError) {
    fail("devices.power_off unpaired should fail");
  }
  assertNoMac(
    parseToolPayload(powerOffUnpaired),
    "devices.power_off unpaired error",
  );
  ok("homebase.devices.power_off unpaired refused");

  const powerOffForged = await callTool(55, "homebase.devices.power_off", {
    device_id: ssapFixtures.paired_dry_id,
    client_key: "forged-secret",
    ssapClientKey: "forged-secret",
  } as Record<string, unknown>);
  assertNoMac(
    parseToolPayload(powerOffForged),
    "devices.power_off forged key args",
  );
  if (!powerOffForged.isError) {
    const offPayload = parseToolPayload(powerOffForged) as {
      status?: string;
      action?: string;
    };
    if (offPayload.action !== "power_off" || offPayload.status !== "dry_run") {
      fail(
        `devices.power_off dry-run expected action power_off status dry_run, got ${JSON.stringify(offPayload)}`,
      );
    }
    ok("homebase.devices.power_off dry-run ok");
  } else {
    ok("homebase.devices.power_off forged key args ignored / no key leak");
  }

  const tvList = await callTool(56, "homebase.devices.list", {});
  if (tvList.isError) fail("devices.list after ssap fixtures");
  const tvListed = parseToolPayload(tvList) as {
    id: string;
    tv_capable?: boolean;
  }[];
  const pairedRow = tvListed.find((d) => d.id === ssapFixtures.paired_dry_id);
  if (!pairedRow?.tv_capable) {
    fail(`expected tv_capable on paired fixture: ${JSON.stringify(pairedRow)}`);
  }
  const unpairedRow = tvListed.find((d) => d.id === ssapFixtures.unpaired_id);
  if (unpairedRow?.tv_capable) {
    fail("unpaired fixture must not be tv_capable");
  }
  assertNoMac(tvListed, "devices.list tv_capable");
  ok("devices.list tv_capable");

  // --- T-115 Protocols (list + unknown-name only; never fire Cinema live) ---
  const protocolsList = await callTool(57, "homebase.protocols.list", {});
  if (protocolsList.isError) {
    fail(
      `homebase.protocols.list tool error: ${protocolsList.content?.[0]?.text ?? "unknown"}`,
    );
  }
  const protocolRows = parseToolPayload(protocolsList) as {
    id: string;
    name: string;
    aliases?: string[];
  }[];
  const cinema = protocolRows.find((p) => p.id === "cinema" || p.name === "Cinema");
  if (!cinema) {
    fail(`protocols.list missing Cinema: ${JSON.stringify(protocolRows)}`);
  }
  if (!cinema.aliases?.some((a) => a.toLowerCase() === "bioscoop")) {
    fail(`Cinema missing bioscoop alias: ${JSON.stringify(cinema)}`);
  }
  ok("homebase.protocols.list includes Cinema + bioscoop");

  const unknownProtocol = await callTool(58, "homebase.protocols.run", {
    name: "mcp-smoke-unknown-protocol-xyz",
  });
  if (!unknownProtocol.isError) {
    const payload = parseToolPayload(unknownProtocol) as {
      status?: string;
      success?: boolean;
    };
    if (payload.success !== false && payload.status !== "not_found") {
      fail(
        `protocols.run unknown should fail / not_found, got ${JSON.stringify(payload)}`,
      );
    }
  } else {
    const errPayload = parseToolPayload(unknownProtocol) as {
      error?: { code?: string };
    };
    if (errPayload.error?.code !== "not_found") {
      fail(
        `protocols.run unknown expected not_found, got ${JSON.stringify(errPayload)}`,
      );
    }
  }
  ok("homebase.protocols.run unknown name refused (Cinema not fired)");

  await runLightsSmoke(callTool);
}

type SsapSmokeFixtures = {
  unpaired_id: string;
  paired_dry_id: string;
};

async function seedSsapSmokeFixturesLocal(): Promise<SsapSmokeFixtures> {
  const { ensureNetworkCatalogues } = await import(
    "../src/domain/network/ensure-catalogues"
  );
  const prisma = createPrismaClient();
  try {
    await ensureNetworkCatalogues(HOUSEHOLD_ID!);
    const type = await prisma.networkDeviceType.findFirst({
      where: { householdId: HOUSEHOLD_ID!, slug: "pc" },
    });
    const location = await prisma.deviceLocation.findFirst({
      where: { householdId: HOUSEHOLD_ID!, slug: "unknown" },
    });
    if (!type || !location) {
      fail("ssap fixtures: missing pc type or unknown location");
    }
    const stamp = Date.now().toString(16).slice(-6).padStart(6, "0");
    const unpaired = await prisma.networkDevice.create({
      data: {
        householdId: HOUSEHOLD_ID!,
        name: `mcp-smoke ssap unpaired ${stamp}`,
        typeId: type.id,
        locationId: location.id,
        lastSeenIp: "192.168.1.200",
        notes: "mcp-smoke",
      },
    });
    const paired = await prisma.networkDevice.create({
      data: {
        householdId: HOUSEHOLD_ID!,
        name: `mcp-smoke ssap paired ${stamp}`,
        typeId: type.id,
        locationId: location.id,
        lastSeenIp: "192.168.1.201",
        ssapClientKey: `smoke-key-${stamp}`,
        ssapPairedAt: new Date(),
        notes: "mcp-smoke",
      },
    });
    return {
      unpaired_id: unpaired.id,
      paired_dry_id: paired.id,
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function seedSsapSmokeFixtures(): Promise<SsapSmokeFixtures> {
  if (IS_LOCAL) {
    return seedSsapSmokeFixturesLocal();
  }

  const nasHost = process.env.NAS_HOST?.trim();
  if (!nasHost) {
    fail(
      "remote ssap fixture seed requires NAS_HOST (or run mcp:smoke locally)",
    );
  }
  const nasUser = process.env.NAS_USER?.trim() || "wim";
  const nasPath =
    process.env.NAS_PATH?.trim() || "/volume1/docker/homebase";
  const sshPortRaw = process.env.NAS_SSH_PORT?.trim();
  const sshPort =
    sshPortRaw && Number.parseInt(sshPortRaw, 10) > 0
      ? Number.parseInt(sshPortRaw, 10)
      : 22;
  const remote = `${nasUser}@${nasHost}`;
  const remoteCmd = [
    "set -eu",
    `cd ${shellSingleQuote(nasPath)}`,
    `docker compose exec -T -e MCP_HOUSEHOLD_ID=${shellSingleQuote(HOUSEHOLD_ID!)} worker npx tsx scripts/seed-ssap-smoke-fixtures.ts`,
  ].join(" && ");
  const out = execFileSync("ssh", ["-p", String(sshPort), remote, remoteCmd], {
    encoding: "utf8",
  });
  const line = out.trim().split("\n").filter(Boolean).pop() ?? "";
  let fixtures: SsapSmokeFixtures;
  try {
    fixtures = JSON.parse(line) as SsapSmokeFixtures;
  } catch {
    fail(`remote ssap fixture seed bad output: ${out}`);
  }
  await sleepMs(500);
  return fixtures;
}

type WolSmokeFixtures = {
  allowlisted_id: string;
  not_allowed_id: string;
  retired_id: string;
};

async function seedWolSmokeFixturesLocal(): Promise<WolSmokeFixtures> {
  const { ensureNetworkCatalogues } = await import(
    "../src/domain/network/ensure-catalogues"
  );
  const prisma = createPrismaClient();
  try {
    await ensureNetworkCatalogues(HOUSEHOLD_ID!);
    const type = await prisma.networkDeviceType.findFirst({
      where: { householdId: HOUSEHOLD_ID!, slug: "pc" },
    });
    const location = await prisma.deviceLocation.findFirst({
      where: { householdId: HOUSEHOLD_ID!, slug: "unknown" },
    });
    if (!type || !location) {
      fail("wol fixtures: missing pc type or unknown location");
    }
    const stamp = Date.now().toString(16).slice(-6).padStart(6, "0");
    const allowlisted = await prisma.networkDevice.create({
      data: {
        householdId: HOUSEHOLD_ID!,
        name: `mcp-smoke wol allow ${stamp}`,
        typeId: type.id,
        locationId: location.id,
        macAddress: `02:00:00:${stamp.slice(0, 2)}:${stamp.slice(2, 4)}:${stamp.slice(4, 6)}`,
        wakeAllowed: true,
        notes: "mcp-smoke",
      },
    });
    const notAllowed = await prisma.networkDevice.create({
      data: {
        householdId: HOUSEHOLD_ID!,
        name: `mcp-smoke wol deny ${stamp}`,
        typeId: type.id,
        locationId: location.id,
        macAddress: `02:11:00:${stamp.slice(0, 2)}:${stamp.slice(2, 4)}:${stamp.slice(4, 6)}`,
        wakeAllowed: false,
        notes: "mcp-smoke",
      },
    });
    const retired = await prisma.networkDevice.create({
      data: {
        householdId: HOUSEHOLD_ID!,
        name: `mcp-smoke wol retired ${stamp}`,
        typeId: type.id,
        locationId: location.id,
        macAddress: `02:22:00:${stamp.slice(0, 2)}:${stamp.slice(2, 4)}:${stamp.slice(4, 6)}`,
        wakeAllowed: true,
        retiredAt: new Date(),
        notes: "mcp-smoke",
      },
    });
    return {
      allowlisted_id: allowlisted.id,
      not_allowed_id: notAllowed.id,
      retired_id: retired.id,
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function seedWolSmokeFixtures(): Promise<WolSmokeFixtures> {
  if (IS_LOCAL) {
    return seedWolSmokeFixturesLocal();
  }

  const nasHost = process.env.NAS_HOST?.trim();
  if (!nasHost) {
    fail(
      "remote wol fixture seed requires NAS_HOST (or run mcp:smoke locally)",
    );
  }
  const nasUser = process.env.NAS_USER?.trim() || "wim";
  const nasPath =
    process.env.NAS_PATH?.trim() || "/volume1/docker/homebase";
  const sshPortRaw = process.env.NAS_SSH_PORT?.trim();
  const sshPort =
    sshPortRaw && Number.parseInt(sshPortRaw, 10) > 0
      ? Number.parseInt(sshPortRaw, 10)
      : 22;
  const remote = `${nasUser}@${nasHost}`;
  const remoteCmd = [
    "set -eu",
    `cd ${shellSingleQuote(nasPath)}`,
    `docker compose exec -T -e MCP_HOUSEHOLD_ID=${shellSingleQuote(HOUSEHOLD_ID!)} worker npx tsx scripts/seed-wol-smoke-fixtures.ts`,
  ].join(" && ");
  const out = execFileSync("ssh", ["-p", String(sshPort), remote, remoteCmd], {
    encoding: "utf8",
  });
  const line = out.trim().split("\n").filter(Boolean).pop() ?? "";
  let fixtures: WolSmokeFixtures;
  try {
    fixtures = JSON.parse(line) as WolSmokeFixtures;
  } catch {
    fail(`remote wol fixture seed bad output: ${out}`);
  }
  // Brief settle so the next MCP fetch is not racing a just-closed keep-alive.
  await sleepMs(500);
  return fixtures;
}

/**
 * Remove mcp-smoke / Smoke Add leftovers.
 * Local MCP: Prisma against DATABASE_URL.
 * Remote MCP: always SSH worker purge (never local Prisma — that DB is not what smoke wrote).
 */
async function cleanupSmokeLeftovers() {
  if (process.env.HOMEBASE_SMOKE_KEEP_DATA === "1") {
    console.log(
      "NOTE: HOMEBASE_SMOKE_KEEP_DATA=1 — leaving smoke rows in the database",
    );
    return;
  }

  if (!HOUSEHOLD_ID) {
    fail(
      "smoke cleanup requires MCP_HOUSEHOLD_ID (refusing unscoped purge)",
    );
  }

  if (!IS_LOCAL) {
    await cleanupSmokeLeftoversRemote();
    return;
  }

  await cleanupSmokeLeftoversLocal();
}

async function cleanupSmokeLeftoversLocal() {
  const prisma = createPrismaClient();
  try {
    const household = await prisma.household.findUnique({
      where: { id: HOUSEHOLD_ID! },
      select: { id: true },
    });
    if (!household) {
      fail(
        `smoke cleanup: MCP_HOUSEHOLD_ID=${HOUSEHOLD_ID} does not exist in DATABASE_URL`,
      );
    }
    const counts = await applySmokePurge(prisma, {
      householdId: HOUSEHOLD_ID!,
    });
    if (totalPurgeCounts(counts) === 0) {
      ok("smoke cleanup (nothing to delete)");
    } else {
      ok(`smoke cleanup (${formatPurgeCounts(counts)})`);
    }
    const residual = await residualSmokeCount(prisma, {
      householdId: HOUSEHOLD_ID!,
    });
    if (residual > 0) {
      fail(
        `smoke cleanup residual verify failed: ${residual} matching row(s) remain`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function cleanupSmokeLeftoversRemote() {
  const nasHost = process.env.NAS_HOST?.trim();
  if (!nasHost) {
    fail(
      "remote smoke cleanup requires NAS_HOST (set by deploy:nas or .env). " +
        "Manual: docker compose exec worker npx tsx scripts/purge-smoke-data.ts --apply",
    );
  }

  const nasUser = process.env.NAS_USER?.trim() || "wim";
  const nasPath =
    process.env.NAS_PATH?.trim() || "/volume1/docker/homebase";
  const sshPortRaw = process.env.NAS_SSH_PORT?.trim();
  const sshPort =
    sshPortRaw && Number.parseInt(sshPortRaw, 10) > 0
      ? Number.parseInt(sshPortRaw, 10)
      : 22;
  const remote = `${nasUser}@${nasHost}`;

  const remoteCmd = [
    "set -eu",
    `cd ${shellSingleQuote(nasPath)}`,
    `docker compose exec -T -e MCP_HOUSEHOLD_ID=${shellSingleQuote(HOUSEHOLD_ID!)} worker npx tsx scripts/purge-smoke-data.ts --apply`,
  ].join(" && ");

  const sshArgs = ["-p", String(sshPort), remote, remoteCmd];
  console.log(`Cleaning smoke leftovers via SSH ${remote} (port ${sshPort})...`);
  try {
    execFileSync("ssh", sshArgs, { stdio: "inherit" });
  } catch (err) {
    fail(
      `SSH smoke cleanup failed (${err instanceof Error ? err.message : err}). ` +
        "On NAS: docker compose exec worker npx tsx scripts/purge-smoke-data.ts --apply",
    );
  }
  // Purge CLI exits nonzero on missing household or residual rows — SSH inherit
  // already failed above. Success means residual verify passed on the worker.
  ok("smoke cleanup (via NAS worker, residual verify OK)");
}

/** Quote a value for safe embedding in a remote single-quoted shell fragment. */
function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

type CallTool = (
  id: number,
  name: string,
  args: Record<string, unknown>,
) => Promise<ToolResult>;

type LightRow = {
  id: string;
  name: string;
  room?: string;
  isOn: boolean;
  reachable?: boolean;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isReachable(light: LightRow): boolean {
  return light.reachable !== false;
}

function lightsWriteSmokeAllowed(): boolean {
  if (!IS_LOCAL) return false;
  if (process.env.HOMEBASE_SMOKE_LIGHTS_WRITE !== "1") return false;
  return Boolean(process.env.DIRIGERA_TEST_DEVICE_ID?.trim());
}

function pickTestLight(lights: LightRow[]): LightRow | undefined {
  const envTestId = process.env.DIRIGERA_TEST_DEVICE_ID?.trim();
  if (!envTestId) {
    return undefined;
  }
  return lights.filter(isReachable).find((l) => l.id === envTestId);
}

async function waitForLightState(
  callTool: CallTool,
  toolId: number,
  deviceId: string,
  expectedOn: boolean,
  options?: { attempts?: number; delayMs?: number },
): Promise<LightRow | undefined> {
  const attempts = options?.attempts ?? 5;
  const delayMs = options?.delayMs ?? 500;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) {
      await sleep(delayMs);
    }
    const listResult = await callTool(toolId + attempt, "homebase.lights.list", {});
    if (listResult.isError) {
      continue;
    }
    const rows = parseToolPayload(listResult) as LightRow[];
    const light = rows.find((l) => l.id === deviceId);
    if (light && light.isOn === expectedOn) {
      return light;
    }
  }
  return undefined;
}

async function runLightsSmoke(callTool: CallTool) {
  const lightsListResult = await callTool(28, "homebase.lights.list", {});

  if (lightsListResult.isError) {
    const payload = parseToolPayload(lightsListResult) as {
      error?: { code?: string; message?: string };
    };
    if (
      payload.error?.code === "unavailable" &&
      payload.error?.message === "Dirigera not configured"
    ) {
      console.log("NOTE: Dirigera not configured on target — lights smoke skipped");
      ok("homebase.lights.list (skipped, Dirigera unavailable)");
      return;
    }
    fail(
      `homebase.lights.list tool error: ${payload.error?.message ?? JSON.stringify(payload)}`,
    );
  }

  const lights = parseToolPayload(lightsListResult) as LightRow[];
  if (!Array.isArray(lights)) {
    fail("homebase.lights.list did not return an array");
  }
  ok(`homebase.lights.list (${lights.length} light(s))`);

  // Valid UUID shape that will not match a real Dirigera device (T-034 / T-038 — GET only, no PATCH).
  const staleProbeId = "00000000-0000-4000-8000-000000000000";
  if (lights.some((l) => l.id === staleProbeId)) {
    fail("stale-id probe id unexpectedly present in lights.list — pick another reserved uuid");
  }
  const staleResult = await callTool(27, "homebase.lights.set_state", {
    device_id: staleProbeId,
    on: false,
  });
  if (staleResult.isError) {
    fail("homebase.lights.set_state stale-id probe crashed (MCP isError)");
  }
  const stalePayload = parseToolPayload(staleResult) as {
    success: boolean;
    error?: string;
  };
  if (stalePayload.success !== false || stalePayload.error !== "Unknown or stale device_id") {
    fail(
      `stale-id probe expected success:false error "Unknown or stale device_id", got ${JSON.stringify(stalePayload)}`,
    );
  }
  ok("homebase.lights.set_state (stale device_id → success:false)");

  if (lights.length === 0) {
    console.log("NOTE: no IKEA lights on hub — write smoke skipped");
    return;
  }

  if (!lightsWriteSmokeAllowed()) {
    console.log(
      "NOTE: lights write smoke skipped (list-only; set HOMEBASE_SMOKE_LIGHTS_WRITE=1 and DIRIGERA_TEST_DEVICE_ID for local toggle)",
    );
    ok("homebase.lights.set_state (skipped, list-only smoke)");
    return;
  }

  const testDeviceId = process.env.DIRIGERA_TEST_DEVICE_ID!.trim();
  const testDevice = pickTestLight(lights);
  if (!testDevice) {
    fail(
      `DIRIGERA_TEST_DEVICE_ID ${testDeviceId} not found or unreachable — pin a dedicated test lamp, never a household light in daily use`,
    );
  }

  const deviceId = testDevice.id;
  const originalOn = testDevice.isOn;
  console.log(
    `Using test light: ${testDevice.name}${testDevice.room ? ` (${testDevice.room})` : ""} [${deviceId}]`,
  );

  const pollOptions = IS_LOCAL
    ? { attempts: 5, delayMs: 500 }
    : { attempts: 12, delayMs: 750 };

  const setOffResult = await callTool(29, "homebase.lights.set_state", {
    device_id: deviceId,
    on: false,
  });
  if (setOffResult.isError) {
    fail("homebase.lights.set_state (off) tool error");
  }
  const setOffPayload = parseToolPayload(setOffResult) as {
    success: boolean;
    device_id: string;
    on: boolean;
    error?: string;
  };
  if (!setOffPayload.success) {
    fail(
      `homebase.lights.set_state (off) failed: ${setOffPayload.error ?? "unknown"}`,
    );
  }

  const afterOff = await waitForLightState(callTool, 30, deviceId, false, pollOptions);
  if (!afterOff) {
    if (IS_LOCAL) {
      fail(
        `expected ${deviceId} isOn false after set_state off (reachable lamp; hub may be slow — retried ${pollOptions.attempts}x)`,
      );
    }
    console.log(
      `NOTE: set_state off succeeded but lights.list did not confirm isOn=false within ${pollOptions.attempts} polls (Dirigera hub lag on NAS)`,
    );
  }

  const restoreOn = originalOn;
  const setOnResult = await callTool(35, "homebase.lights.set_state", {
    device_id: deviceId,
    on: restoreOn,
  });
  if (setOnResult.isError) {
    fail("homebase.lights.set_state (restore) tool error");
  }
  const setOnPayload = parseToolPayload(setOnResult) as { success: boolean; error?: string };
  if (!setOnPayload.success) {
    fail(
      `homebase.lights.set_state (restore) failed: ${setOnPayload.error ?? "unknown"}`,
    );
  }

  if (afterOff) {
    ok("lights list → set_state off/on round-trip");
  } else {
    ok("homebase.lights.set_state (off/on commands OK; hub state unconfirmed on remote)");
  }
}

async function runInventoryUpdateSmokeLocal(callTool: CallTool) {
  const prisma = createPrismaClient();
  const productName = `mcp-smoke-product-${Date.now()}`;
  let productId: string | undefined;

  try {
    const product = await prisma.product.create({
      data: {
        householdId: HOUSEHOLD_ID!,
        name: productName,
        stockItems: {
          create: { householdId: HOUSEHOLD_ID!, quantity: 5 },
        },
      },
    });
    productId = product.id;

    await runInventoryUpdateChecks(callTool, productId, 5, 2);
  } finally {
    if (productId) {
      await prisma.product.deleteMany({
        where: { id: productId, householdId: HOUSEHOLD_ID! },
      });
    }
    await prisma.$disconnect();
  }
}

async function runInventoryUpdateSmokeRemote(callTool: CallTool) {
  const allInvResult = await callTool(11, "homebase.inventory.list", {});
  if (allInvResult.isError) {
    fail("homebase.inventory.list (full) tool error");
  }
  const products = parseToolPayload(allInvResult) as {
    id: string;
    quantity: number;
  }[];
  const product = products.find((p) => p.quantity >= 1);
  if (!product) {
    console.log(
      "NOTE: no inventory products with quantity >= 1 on NAS — inventory.update tests skipped (remote mode)",
    );
    ok("homebase.inventory.update (skipped, no positive stock)");
    return;
  }

  const initialQty = product.quantity;
  const setQtyTarget = initialQty === 2 ? 3 : 2;
  await runInventoryUpdateChecks(
    callTool,
    product.id,
    initialQty,
    setQtyTarget,
  );
}

async function runInventoryUpdateChecks(
  callTool: CallTool,
  productId: string,
  initialQty: number,
  setQtyTarget: number,
) {
  const deltaResult = await callTool(11, "homebase.inventory.update", {
    id: productId,
    delta: -1,
  });
  if (deltaResult.isError) {
    const errText = deltaResult.content?.[0]?.text ?? "(no detail)";
    fail(`homebase.inventory.update (delta) tool error: ${errText}`);
  }
  const afterDelta = parseToolPayload(deltaResult) as {
    change_id: string;
    quantity: number;
  };
  if (!afterDelta.change_id) {
    fail("inventory.update missing change_id");
  }
  if (afterDelta.quantity !== initialQty - 1) {
    fail(
      `expected quantity ${initialQty - 1} after delta -1, got ${afterDelta.quantity}`,
    );
  }
  ok("homebase.inventory.update (delta)");

  const invRevert = await callTool(12, "homebase.changes.revert", {
    change_id: afterDelta.change_id,
  });
  if (invRevert.isError) {
    fail("changes.revert (inventory) tool error");
  }

  const gotAfterRevert = await callTool(13, "homebase.inventory.get", {
    id: productId,
  });
  const restored = parseToolPayload(gotAfterRevert) as { quantity: number };
  if (restored.quantity !== initialQty) {
    fail(
      `expected quantity ${initialQty} after inventory revert, got ${restored.quantity}`,
    );
  }
  ok("inventory.update → revert restores quantity");

  const qtyResult = await callTool(14, "homebase.inventory.update", {
    id: productId,
    quantity: setQtyTarget,
  });
  if (qtyResult.isError) {
    fail("homebase.inventory.update (quantity) tool error");
  }
  const afterQty = parseToolPayload(qtyResult) as {
    change_id?: string;
    quantity: number;
  };
  if (afterQty.quantity !== setQtyTarget) {
    fail(
      `expected quantity ${setQtyTarget} after set, got ${afterQty.quantity}`,
    );
  }
  ok("homebase.inventory.update (quantity)");

  if (afterQty.change_id) {
    const qtyRevert = await callTool(26, "homebase.changes.revert", {
      change_id: afterQty.change_id,
    });
    if (qtyRevert.isError) {
      fail("changes.revert (inventory quantity set) tool error");
    }
    const gotAfterQtyRevert = await callTool(27, "homebase.inventory.get", {
      id: productId,
    });
    const afterQtyRevert = parseToolPayload(gotAfterQtyRevert) as {
      quantity: number;
    };
    if (afterQtyRevert.quantity !== initialQty) {
      fail(
        `expected quantity ${initialQty} after quantity-set revert, got ${afterQtyRevert.quantity}`,
      );
    }
  }

  const badResult = await callTool(15, "homebase.inventory.update", {
    id: productId,
    quantity: setQtyTarget,
    delta: -1,
  });
  if (!badResult.isError) {
    fail("expected invalid_input when both quantity and delta provided");
  }
  const badPayload = parseToolPayload(badResult) as {
    error?: { code: string };
  };
  if (badPayload.error?.code !== "invalid_input") {
    fail(
      `expected invalid_input error code, got ${JSON.stringify(badPayload)}`,
    );
  }
  ok("homebase.inventory.update rejects both quantity and delta");
}

async function run() {
  let smokeError: unknown;
  try {
    await main();
  } catch (err) {
    smokeError = err;
    console.error(err instanceof Error ? err.message : err);
  }

  try {
    await cleanupSmokeLeftovers();
  } catch (cleanupErr) {
    console.error(
      cleanupErr instanceof Error ? cleanupErr.message : cleanupErr,
    );
    if (!smokeError) {
      smokeError = cleanupErr;
    }
  }

  if (smokeError) {
    process.exit(1);
  }

  console.log("\nAll MCP smoke checks passed.");
}

run();
