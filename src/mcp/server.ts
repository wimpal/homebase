import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DomainError, isDomainError } from "@/domain/error";
import { getInventory, listInventory } from "@/domain/inventory";
import { listShoppingItems } from "@/domain/shopping";

function toolJson(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
  };
}

function toolError(err: DomainError) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(err.toJson()) }],
    isError: true as const,
  };
}

export function createMcpServer(householdId: string): McpServer {
  const server = new McpServer({
    name: "homebase",
    version: "0.1.0",
  });

  server.registerTool(
    "homebase.inventory.list",
    {
      description:
        'List household inventory products with on-hand quantities. Use for "what do we have", "are we out of X", or low-stock checks. Returns totals per product with per-location breakdown. Not for shopping needs — use homebase.shopping_list.list for that.',
      inputSchema: {
        location: z
          .string()
          .optional()
          .describe("Filter by location name, e.g. pantry or fridge"),
        category: z.string().optional().describe("Filter by product category"),
        low_stock_only: z
          .boolean()
          .optional()
          .describe("Only products at or below their threshold"),
      },
    },
    async (input) => {
      const items = await listInventory(householdId, input);
      return toolJson(items);
    },
  );

  server.registerTool(
    "homebase.inventory.get",
    {
      description:
        "Get one inventory product by id with stock breakdown by location and barcodes.",
      inputSchema: {
        id: z.string().describe("Product id"),
      },
    },
    async ({ id }) => {
      const result = await getInventory(householdId, id);
      if (isDomainError(result)) {
        return toolError(result);
      }
      return toolJson(result);
    },
  );

  server.registerTool(
    "homebase.shopping_list.list",
    {
      description:
        'Get the household primary shopping list. Use for "what do we need" or "what\'s on the list". Not for budget or expenses — use budgettracker for money.',
      inputSchema: {
        include_checked: z
          .boolean()
          .optional()
          .describe("Include checked-off items"),
        include_done: z
          .boolean()
          .optional()
          .describe("Deprecated alias for include_checked"),
      },
    },
    async (input) => {
      const result = await listShoppingItems(householdId, input);
      if (isDomainError(result)) {
        return toolError(result);
      }
      return toolJson(result);
    },
  );

  return server;
}
