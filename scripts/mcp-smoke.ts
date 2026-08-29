/**
 * Smoke test for Homebase MCP at /mcp (T-004 read + T-012 write + T-013 change log).
 * Requires: dev server running, SERVICE_TOKEN + MCP_HOUSEHOLD_ID in .env
 *
 * Usage:
 *   npm run mcp:smoke                              # local (127.0.0.1)
 *   MCP_BASE_URL=http://192.168.0.170:3000 npm run mcp:smoke   # NAS (no local DB)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

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

const BASE_URL = process.env.MCP_BASE_URL ?? "http://127.0.0.1:3000";
const TOKEN = process.env.SERVICE_TOKEN?.trim();
const HOUSEHOLD_ID = process.env.MCP_HOUSEHOLD_ID?.trim();

function isLocalMcpTarget(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
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
  const res = await fetch(`${BASE_URL}/mcp`, {
    method: "POST",
    headers,
    body,
  });
  const text = await res.text();
  return { status: res.status, body: text };
}

function parseJson(body: string): unknown {
  return JSON.parse(body);
}

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
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
    "homebase.inventory.get",
    "homebase.inventory.list",
    "homebase.inventory.update",
    "homebase.recipes.get",
    "homebase.recipes.search",
    "homebase.shopping_list.add_item",
    "homebase.shopping_list.list",
    "homebase.tasks.add",
    "homebase.tasks.complete",
    "homebase.tasks.list",
  ];
  if (names.length !== 12 || !expected.every((n) => names.includes(n))) {
    fail(`expected tools ${expected.join(", ")}, got ${names.join(", ")}`);
  }
  ok("tools/list returns exactly 12 homebase tools");

  const invListResult = await callTool(3, "homebase.inventory.list", {
    low_stock_only: true,
  });
  if (invListResult.isError) {
    fail("homebase.inventory.list tool error");
  }
  ok("homebase.inventory.list (low_stock_only)");

  const shopListResult = await callTool(4, "homebase.shopping_list.list", {});
  if (shopListResult.isError) {
    fail("homebase.shopping_list.list tool error");
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

  const shopAfterAdd = await callTool(6, "homebase.shopping_list.list", {});
  if (shopAfterAdd.isError) {
    fail("shopping_list.list after add_item failed");
  }
  const shopItems = parseToolPayload(shopAfterAdd) as { name: string }[];
  if (!shopItems.some((item) => item.name === smokeItemName)) {
    fail(`added item ${smokeItemName} not found on shopping list`);
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
  if (!changeRows.some((row) => row.change_id === added.change_id)) {
    fail("change log missing add_item entry");
  }

  const revertedAdd = await callTool(8, "homebase.changes.revert", {
    change_id: added.change_id,
  });
  if (revertedAdd.isError) {
    fail("changes.revert (add_item) tool error");
  }
  const revertPayload = parseToolPayload(revertedAdd) as {
    change_id: string;
    reverted_at?: string;
  };
  if (revertPayload.change_id !== added.change_id || !revertPayload.reverted_at) {
    fail(`unexpected revert payload: ${JSON.stringify(revertPayload)}`);
  }

  const shopAfterRevert = await callTool(9, "homebase.shopping_list.list", {});
  const shopAfterRevertItems = parseToolPayload(shopAfterRevert) as {
    name: string;
  }[];
  if (shopAfterRevertItems.some((item) => item.name === smokeItemName)) {
    fail("shopping item still on list after revert");
  }

  const doubleRevert = await callTool(10, "homebase.changes.revert", {
    change_id: added.change_id,
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

  console.log("\nAll MCP smoke checks passed.");
}

type CallTool = (
  id: number,
  name: string,
  args: Record<string, unknown>,
) => Promise<ToolResult>;

async function runInventoryUpdateSmokeLocal(callTool: CallTool) {
  const prisma = new PrismaClient();
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
  const product =
    products.find((p) => p.quantity >= 1) ?? products[0] ?? undefined;
  if (!product) {
    console.log(
      "NOTE: no inventory products on NAS — inventory.update tests skipped (remote mode)",
    );
    ok("homebase.inventory.update (skipped, empty household)");
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
    fail("homebase.inventory.update (delta) tool error");
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
