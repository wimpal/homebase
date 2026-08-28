/**
 * Smoke test for Homebase MCP at /mcp (T-004 read + T-012 write + T-013 change log).
 * Requires: dev server running, SERVICE_TOKEN + MCP_HOUSEHOLD_ID in .env
 *
 * Usage: npm run mcp:smoke
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

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

loadDotEnv();

const BASE_URL = process.env.MCP_BASE_URL ?? "http://127.0.0.1:3000";
const TOKEN = process.env.SERVICE_TOKEN?.trim();
const HOUSEHOLD_ID = process.env.MCP_HOUSEHOLD_ID?.trim();

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
    fail(`initialize failed (${initStatus}): ${initRes}`);
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
    "homebase.shopping_list.add_item",
    "homebase.shopping_list.list",
  ];
  if (names.length !== 7 || !expected.every((n) => names.includes(n))) {
    fail(`expected tools ${expected.join(", ")}, got ${names.join(", ")}`);
  }
  ok("tools/list returns exactly 7 homebase tools");

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

  const prisma = new PrismaClient();
  const productName = `mcp-smoke-product-${Date.now()}`;
  let productId: string | undefined;

  try {
    const product = await prisma.product.create({
      data: {
        householdId: HOUSEHOLD_ID,
        name: productName,
        stockItems: {
          create: { householdId: HOUSEHOLD_ID, quantity: 5 },
        },
      },
    });
    productId = product.id;

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
    if (afterDelta.quantity !== 4) {
      fail(`expected quantity 4 after delta -1, got ${afterDelta.quantity}`);
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
    if (restored.quantity !== 5) {
      fail(`expected quantity 5 after inventory revert, got ${restored.quantity}`);
    }
    ok("inventory.update → revert restores quantity");

    const qtyResult = await callTool(14, "homebase.inventory.update", {
      id: productId,
      quantity: 2,
    });
    if (qtyResult.isError) {
      fail("homebase.inventory.update (quantity) tool error");
    }
    const afterQty = parseToolPayload(qtyResult) as { quantity: number };
    if (afterQty.quantity !== 2) {
      fail(`expected quantity 2 after set, got ${afterQty.quantity}`);
    }
    ok("homebase.inventory.update (quantity)");

    const badResult = await callTool(15, "homebase.inventory.update", {
      id: productId,
      quantity: 2,
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
  } finally {
    if (productId) {
      await prisma.product.deleteMany({
        where: { id: productId, householdId: HOUSEHOLD_ID },
      });
    }
    await prisma.$disconnect();
  }

  console.log("\nAll MCP smoke checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
