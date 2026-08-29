import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DomainError, isDomainError } from "@/domain/error";
import { listMcpChanges, revertMcpChange } from "@/domain/changes";
import { getInventory, listInventory, updateInventory } from "@/domain/inventory";
import { getRecipe, searchRecipes } from "@/domain/recipes";
import { addShoppingListItem, listShoppingItems } from "@/domain/shopping";
import { addChore, completeChoreDomain, listChores } from "@/domain/tasks";

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
    "homebase.inventory.update",
    {
      description:
        'Set or adjust inventory quantity. Use delta for "we used two" and quantity for "we have four left". Exactly one of quantity or delta.',
      inputSchema: {
        id: z.string().describe("Product id"),
        quantity: z
          .number()
          .optional()
          .describe("Absolute on-hand total to set"),
        delta: z
          .number()
          .optional()
          .describe("Change to apply to current total, e.g. -2"),
      },
    },
    async (input) => {
      const result = await updateInventory(householdId, {
        ...input,
        mcp_audit: { tool_name: "homebase.inventory.update" },
      });
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

  server.registerTool(
    "homebase.shopping_list.add_item",
    {
      description:
        "Add an item to the household primary shopping list. Matches name to a known inventory product when possible.",
      inputSchema: {
        name: z.string().describe("Item name"),
        quantity: z
          .number()
          .optional()
          .describe("Quantity to buy, default 1"),
        unit: z
          .string()
          .optional()
          .describe("Unit hint, e.g. pcs or kg (informational only)"),
      },
    },
    async (input) => {
      const result = await addShoppingListItem(householdId, {
        ...input,
        mcp_audit: { tool_name: "homebase.shopping_list.add_item" },
      });
      if (isDomainError(result)) {
        return toolError(result);
      }
      return toolJson(result);
    },
  );

  server.registerTool(
    "homebase.changes.list",
    {
      description:
        "List recent MCP write operations (audit log). Use to find change_id before reverting a mistaken add or inventory update.",
      inputSchema: {
        limit: z
          .number()
          .int()
          .optional()
          .describe("Max rows to return (default 20, max 100)"),
        include_reverted: z
          .boolean()
          .optional()
          .describe("Include already-reverted changes"),
      },
    },
    async (input) => {
      const rows = await listMcpChanges(householdId, input);
      return toolJson(rows);
    },
  );

  server.registerTool(
    "homebase.changes.revert",
    {
      description:
        "Undo an MCP write by change_id from add_item or inventory.update. Audit row is kept with reverted_at set.",
      inputSchema: {
        change_id: z.string().describe("change_id from a write tool response"),
      },
    },
    async ({ change_id }) => {
      const result = await revertMcpChange(householdId, change_id);
      if (isDomainError(result)) {
        return toolError(result);
      }
      return toolJson(result);
    },
  );

  server.registerTool(
    "homebase.tasks.list",
    {
      description:
        'List household tasks/chores. Use for "what needs doing", "what\'s overdue". Dates are YYYY-MM-DD in the household timezone.',
      inputSchema: {
        assignee: z
          .string()
          .optional()
          .describe("Filter by assignee (ignored in v1)"),
        due_before: z
          .string()
          .optional()
          .describe("YYYY-MM-DD — include tasks due on or before this date"),
        include_done: z
          .boolean()
          .optional()
          .describe("Include chores completed today"),
      },
    },
    async (input) => {
      const items = await listChores(householdId, input);
      return toolJson(items);
    },
  );

  server.registerTool(
    "homebase.tasks.add",
    {
      description: "Create a household task, optionally recurring.",
      inputSchema: {
        title: z.string().describe("Task title"),
        assignee: z
          .string()
          .optional()
          .describe("Assignee (ignored in v1)"),
        due: z.string().optional().describe("Due date YYYY-MM-DD"),
        recurrence: z
          .string()
          .optional()
          .describe("e.g. weekly, monthly, every 3 days"),
      },
    },
    async (input) => {
      const result = await addChore(householdId, input);
      if (isDomainError(result)) {
        return toolError(result);
      }
      return toolJson(result);
    },
  );

  server.registerTool(
    "homebase.tasks.complete",
    {
      description:
        "Mark a task done. Recurring tasks roll forward to the next occurrence.",
      inputSchema: {
        id: z.string().describe("Chore id"),
      },
    },
    async ({ id }) => {
      const result = await completeChoreDomain(householdId, { id });
      if (isDomainError(result)) {
        return toolError(result);
      }
      return toolJson(result);
    },
  );

  server.registerTool(
    "homebase.recipes.search",
    {
      description:
        'Find recipes by name or ingredient. Use for meal planning and "what can I make with what\'s in the house" — combine with homebase.inventory.list.',
      inputSchema: {
        query: z.string().optional().describe("Search recipe title"),
        ingredients: z
          .array(z.string())
          .optional()
          .describe("Only return recipes using all of these ingredients"),
      },
    },
    async (input) => {
      const items = await searchRecipes(householdId, input);
      return toolJson(items);
    },
  );

  server.registerTool(
    "homebase.recipes.get",
    {
      description: "Get a full recipe including steps and quantities.",
      inputSchema: {
        id: z.string().describe("Recipe id"),
      },
    },
    async ({ id }) => {
      const result = await getRecipe(householdId, id);
      if (isDomainError(result)) {
        return toolError(result);
      }
      return toolJson(result);
    },
  );

  return server;
}
