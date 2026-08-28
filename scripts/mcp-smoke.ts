/**
 * Smoke test for Homebase MCP at /mcp (T-004).
 * Requires: dev server running, SERVICE_TOKEN + MCP_HOUSEHOLD_ID in .env
 *
 * Usage: npm run mcp:smoke
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

async function main() {
  if (!TOKEN) {
    fail("SERVICE_TOKEN is not set in the environment");
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
    "homebase.inventory.get",
    "homebase.inventory.list",
    "homebase.shopping_list.list",
  ];
  if (names.length !== 3 || !expected.every((n) => names.includes(n))) {
    fail(`expected tools ${expected.join(", ")}, got ${names.join(", ")}`);
  }
  ok("tools/list returns exactly 3 homebase tools");

  const { status: invStatus, body: invRes } = await mcpPost(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "homebase.inventory.list",
        arguments: { low_stock_only: true },
      },
    }),
    TOKEN,
  );
  if (invStatus !== 200) {
    fail(`inventory.list failed (${invStatus}): ${invRes}`);
  }
  const invJson = parseJson(invRes) as {
    result?: { isError?: boolean; content?: { text: string }[] };
  };
  if (invJson.result?.isError) {
    fail(`inventory.list tool error: ${invRes}`);
  }
  ok("homebase.inventory.list (low_stock_only)");

  const { status: shopStatus, body: shopRes } = await mcpPost(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "homebase.shopping_list.list",
        arguments: {},
      },
    }),
    TOKEN,
  );
  if (shopStatus !== 200) {
    fail(`shopping_list.list failed (${shopStatus}): ${shopRes}`);
  }
  const shopJson = parseJson(shopRes) as {
    result?: { isError?: boolean };
  };
  if (shopJson.result?.isError) {
    fail(`shopping_list.list tool error: ${shopRes}`);
  }
  ok("homebase.shopping_list.list");

  console.log("\nAll MCP smoke checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
