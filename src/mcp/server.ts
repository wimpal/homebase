import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DomainError, isDomainError } from "@/domain/error";
import { listMcpChanges, revertMcpChange } from "@/domain/changes";
import { getInventory, listInventory, updateInventory } from "@/domain/inventory";
import { addRecipe, getRecipe, searchRecipes, updateRecipe } from "@/domain/recipes";
import { addShoppingListItem, completeShoppingItem, listShoppingItems } from "@/domain/shopping";
import { listDirigeraLights, runDirigeraPartyMode, setDirigeraLightState } from "@/domain/smarthome";
import {
  addNetworkDevice,
  getNetworkDevice,
  goHomeNetworkDevice,
  isTvInputId,
  isTvLaunchTarget,
  launchAppNetworkDevice,
  listNetworkDevices,
  retireNetworkDevice,
  setInputNetworkDevice,
  updateNetworkDevice,
  wakeNetworkDevice,
} from "@/domain/network";
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
        'Get needed items on the household primary shopping list. Each entry is a stable slot tied to a catalog product. Use for "what do we need" or "what\'s on the list". Not for budget or expenses — use budgettracker for money.',
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
        "Mark a product as needed on the primary shopping list. Matches or creates a catalog product by name (case-insensitive). Repeat calls dedupe to one slot.",
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
    "homebase.shopping_list.complete_item",
    {
      description:
        "Mark a shopping list slot as bought. Records purchase history and by default increments inventory when the product has stock rows.",
      inputSchema: {
        id: z.string().describe("Shopping list slot id"),
        update_inventory: z
          .boolean()
          .optional()
          .describe("Bump inventory by slot quantity, default true"),
      },
    },
    async (input) => {
      const result = await completeShoppingItem(householdId, {
        id: input.id,
        update_inventory: input.update_inventory,
        source: "mcp",
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
          .describe(
            "Include inactive chores (completed one-offs, recurring not yet due again)",
          ),
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
        'Find recipes by name, ingredient or tag. Use for meal planning and "what can I make with what\'s in the house" — combine with homebase.inventory.list.',
      inputSchema: {
        query: z
          .string()
          .optional()
          .describe("Match title (contains) or an exact normalized tag"),
        ingredients: z
          .array(z.string())
          .optional()
          .describe("Only return recipes using all of these ingredients"),
        tags: z
          .array(z.string())
          .optional()
          .describe(
            "Exact normalized tags; recipe must include every listed tag (AND)",
          ),
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
      description:
        "Get a full recipe including steps, quantities, tags, and optional nutrition.",
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

  const recipeIngredientSchema = z.object({
    name: z.string(),
    quantity: z.string().describe("Free-text amount, e.g. 250 g"),
    group: z
      .string()
      .max(40)
      .optional()
      .describe(
        "Optional subsection key (dressing, marinade, sauce, …); omit = main list",
      ),
    optional: z
      .boolean()
      .optional()
      .describe("When true, ingredient is optional (default false)"),
  });

  server.registerTool(
    "homebase.recipes.add",
    {
      description:
        'Save a structured recipe into Homebase after the user confirms extracted fields. Callers must send steps[] (one plain sentence per element, no leading "1."). Does not fetch URLs or scrape HTML — Mimir fetches/extracts first. Not for edit or delete (use homebase.recipes.update).',
      inputSchema: {
        title: z.string().describe("Recipe title"),
        servings: z
          .number()
          .int()
          .optional()
          .describe("Optional serving count; defaults to 4"),
        ingredients: z
          .array(recipeIngredientSchema)
          .describe("At least one ingredient"),
        steps: z
          .array(z.string())
          .describe(
            "Ordered cook steps; required, ≥1. No leading step numbers inside each string.",
          ),
        step_optional: z
          .array(z.boolean())
          .optional()
          .describe("Parallel to steps[]; omit when all required"),
        tags: z
          .array(z.string())
          .optional()
          .describe("Freeform tags; normalized lowercase"),
        calories: z.number().optional().describe("Optional kcal; omit when unknown"),
        protein_g: z.number().optional(),
        carbs_g: z.number().optional(),
        fat_g: z.number().optional(),
        thumbnail_url: z
          .string()
          .optional()
          .describe("Household upload URL; MCP may omit (UI-only in v1)"),
        source_url: z
          .string()
          .optional()
          .describe("Optional source URL; ignored in v1 (not stored)"),
      },
    },
    async (input) => {
      const result = await addRecipe(householdId, input);
      if (isDomainError(result)) {
        return toolError(result);
      }
      return toolJson(result);
    },
  );

  server.registerTool(
    "homebase.recipes.update",
    {
      description:
        "Full-replace edit of an existing recipe. Callers must get the recipe, merge deltas into a complete payload, then send full content. Omitting nutrition clears those fields; timers[] replaces all timer rows when provided.",
      inputSchema: {
        id: z.string().describe("Existing recipe id"),
        title: z.string(),
        servings: z.number().int().optional(),
        ingredients: z.array(recipeIngredientSchema),
        steps: z.array(z.string()),
        step_optional: z.array(z.boolean()).optional(),
        tags: z.array(z.string()).optional(),
        calories: z.number().optional(),
        protein_g: z.number().optional(),
        carbs_g: z.number().optional(),
        fat_g: z.number().optional(),
        thumbnail_url: z.string().nullable().optional(),
        timers: z
          .array(
            z.object({
              label: z.string(),
              minutes: z.number().int(),
            }),
          )
          .optional()
          .describe("Full replace of timers; empty array clears"),
      },
    },
    async (input) => {
      const result = await updateRecipe(householdId, input);
      if (isDomainError(result)) {
        return toolError(result);
      }
      return toolJson(result);
    },
  );

  server.registerTool(
    "homebase.devices.list",
    {
      description:
        'List Network devices (NAS, PCs, phones, routers, …) and where they live. Use for "where\'s the NAS" or "what\'s in the office". Not for IKEA lights (homebase.lights.*) or cameras.',
      inputSchema: {
        location: z
          .string()
          .optional()
          .describe("Device location id or slug"),
        type: z
          .string()
          .optional()
          .describe("Network device type id or slug (nas, pc, …)"),
        include_retired: z
          .boolean()
          .optional()
          .describe("Include soft-retired devices; default false"),
      },
    },
    async (input) => {
      const result = await listNetworkDevices(householdId, input);
      if (isDomainError(result)) {
        return toolError(result);
      }
      return toolJson(result);
    },
  );

  server.registerTool(
    "homebase.devices.get",
    {
      description:
        "Get one Network device by id with type and Device location. Not for Dirigera lamp ids.",
      inputSchema: {
        id: z.string().describe("Network device id"),
      },
    },
    async ({ id }) => {
      const result = await getNetworkDevice(householdId, id);
      if (isDomainError(result)) {
        return toolError(result);
      }
      return toolJson(result);
    },
  );

  server.registerTool(
    "homebase.devices.add",
    {
      description:
        "Enroll a Network device (name + type + existing Device location). Duplicate names auto-suffix. Does not create locations. Never accepts MAC.",
      inputSchema: {
        name: z.string().describe("Display name; auto-suffixed if duplicate"),
        type: z.string().describe("Existing type id or slug"),
        location: z.string().describe("Existing location id or slug"),
        notes: z.string().optional().describe("Optional free-text notes"),
      },
    },
    async (input) => {
      const result = await addNetworkDevice(householdId, input);
      if (isDomainError(result)) {
        return toolError(result);
      }
      return toolJson(result);
    },
  );

  server.registerTool(
    "homebase.devices.update",
    {
      description:
        "Patch an existing Network device. Omit fields to leave unchanged. Never accepts MAC.",
      inputSchema: {
        id: z.string().describe("Existing Network device id"),
        name: z.string().optional(),
        type: z.string().optional().describe("Existing type id or slug"),
        location: z.string().optional().describe("Existing location id or slug"),
        notes: z.string().optional(),
      },
    },
    async (input) => {
      const result = await updateNetworkDevice(householdId, input);
      if (isDomainError(result)) {
        return toolError(result);
      }
      return toolJson(result);
    },
  );

  server.registerTool(
    "homebase.devices.remove",
    {
      description:
        "Soft-retire a Network device (hidden from default list). Does not hard-delete. Restore is UI-only.",
      inputSchema: {
        id: z.string().describe("Network device id to retire"),
      },
    },
    async ({ id }) => {
      const result = await retireNetworkDevice(householdId, id);
      if (isDomainError(result)) {
        return toolError(result);
      }
      return toolJson(result);
    },
  );

  server.registerTool(
    "homebase.devices.wake",
    {
      description:
        'Send a Wake-on-LAN magic packet for an ADMIN-allowlisted Network device. Use after devices.list when the user asks to wake a NAS/PC/TV by name. device_id only — never a MAC.',
      inputSchema: {
        device_id: z
          .string()
          .describe("Network device id from devices.list / devices.get"),
      },
    },
    async ({ device_id }) => {
      const result = await wakeNetworkDevice(householdId, device_id);
      if (isDomainError(result)) {
        return toolError(result);
      }
      return toolJson(result);
    },
  );

  server.registerTool(
    "homebase.devices.go_home",
    {
      description:
        "Open webOS Home on a paired LG TV (Network device) via SSAP. Optional wake_if_needed. device_id only.",
      inputSchema: {
        device_id: z
          .string()
          .describe("Network device id from devices.list / devices.get"),
        wake_if_needed: z
          .boolean()
          .optional()
          .describe("WoL then floor+poll until SSAP ready before Home"),
      },
    },
    async ({ device_id, wake_if_needed }) => {
      const result = await goHomeNetworkDevice(
        householdId,
        device_id,
        Boolean(wake_if_needed),
      );
      if (isDomainError(result)) {
        return toolError(result);
      }
      return toolJson(result);
    },
  );

  server.registerTool(
    "homebase.devices.launch_app",
    {
      description:
        'Launch named TV app (home or jellyfin) on a paired LG webOS Network device via SSAP. Optional wake_if_needed. Not a deep-link.',
      inputSchema: {
        device_id: z
          .string()
          .describe("Network device id from devices.list / devices.get"),
        target: z
          .string()
          .describe("Named TV launch target: home | jellyfin"),
        wake_if_needed: z
          .boolean()
          .optional()
          .describe("WoL then floor+poll until SSAP ready"),
      },
    },
    async ({ device_id, target, wake_if_needed }) => {
      if (!isTvLaunchTarget(target)) {
        return toolError(
          DomainError.invalidInput("Invalid launch target.", "invalid_target"),
        );
      }
      const result = await launchAppNetworkDevice(
        householdId,
        device_id,
        target,
        Boolean(wake_if_needed),
      );
      if (isDomainError(result)) {
        return toolError(result);
      }
      return toolJson(result);
    },
  );

  server.registerTool(
    "homebase.devices.set_input",
    {
      description:
        "Switch TV input on a paired LG webOS Network device via SSAP (hdmi1–4 or live_tv). Optional wake_if_needed.",
      inputSchema: {
        device_id: z
          .string()
          .describe("Network device id from devices.list / devices.get"),
        input: z
          .string()
          .describe("Allowlisted TV input id: hdmi1|hdmi2|hdmi3|hdmi4|live_tv"),
        wake_if_needed: z
          .boolean()
          .optional()
          .describe("WoL then floor+poll until SSAP ready"),
      },
    },
    async ({ device_id, input, wake_if_needed }) => {
      if (!isTvInputId(input)) {
        return toolError(
          DomainError.invalidInput("Invalid TV input.", "invalid_input"),
        );
      }
      const result = await setInputNetworkDevice(
        householdId,
        device_id,
        input,
        Boolean(wake_if_needed),
      );
      if (isDomainError(result)) {
        return toolError(result);
      }
      return toolJson(result);
    },
  );

  server.registerTool(
    "homebase.lights.list",
    {
      description:
        'List controllable IKEA lights from the Dirigera hub. Use for "which lights are on", "lights in the office", or before toggling a lamp by name. Returns brightness, colour/warmth state and capability hints when available.',
      inputSchema: {},
    },
    async () => {
      const result = await listDirigeraLights();
      if (isDomainError(result)) {
        return toolError(result);
      }
      const lights = result.slice(0, 50).map((light) => ({
        id: light.id,
        name: light.name,
        room: light.room,
        isOn: light.isOn,
        reachable: light.isReachable,
        ...(light.lightLevel != null ? { brightness: light.lightLevel } : {}),
        ...(light.colorTempKelvin != null
          ? { color_temp_kelvin: light.colorTempKelvin }
          : {}),
        ...(light.colorHex != null ? { color_hex: light.colorHex } : {}),
        ...(light.colorPreset != null ? { color_preset: light.colorPreset } : {}),
        supports_brightness: light.supportsBrightness,
        supports_color_temp: light.supportsColorTemp,
        supports_color: light.supportsColor,
      }));
      return toolJson(lights);
    },
  );

  server.registerTool(
    "homebase.lights.set_state",
    {
      description:
        'Turn an IKEA light on or off, optionally set brightness (0–100), colour temperature (Kelvin), or an IKEA colour preset / #RRGGBB (snapped to Tradfri presets). Colour and color temperature are mutually exclusive. Prefer color_preset (e.g. saturated_red, blue, lime) over free hex. Not audited in homebase.changes v1.',
      inputSchema: {
        device_id: z.string().min(1).describe("Dirigera device id from lights.list"),
        on: z.boolean(),
        brightness: z
          .number()
          .min(0)
          .max(100)
          .optional()
          .describe("0–100; only applied when on is true"),
        color_temp_kelvin: z
          .number()
          .optional()
          .describe("Warmth in Kelvin; only when on is true; clamped to device range"),
        color_hex: z
          .string()
          .optional()
          .describe("#RRGGBB; snapped to nearest IKEA chromatic preset when on is true"),
        color_preset: z
          .string()
          .optional()
          .describe(
            "IKEA chromatic preset id: blue, light_blue, saturated_purple, lime, light_purple, yellow, saturated_pink, dark_peach, saturated_red, pink, peach, warm_amber, light_pink",
          ),
      },
    },
    async ({ device_id, on, brightness, color_temp_kelvin, color_hex, color_preset }) => {
      const result = await setDirigeraLightState(
        device_id,
        on,
        on
          ? {
              brightness,
              colorTempKelvin: color_temp_kelvin,
              colorHex: color_hex,
              colorPreset: color_preset,
            }
          : undefined,
      );
      return toolJson({
        success: result.success,
        device_id,
        on,
        ...(result.error ? { error: result.error } : {}),
      });
    },
  );

  // Blocks up to 60s — Mimir MCP client may need extended timeout for this tool only.
  server.registerTool(
    "homebase.lights.party_mode",
    {
      description:
        "Party mode easter egg: all reachable IKEA lights flicker on and off together for a short show, then each lamp is restored to its on/off state before the show started. Explicit operator request only — not for routine automation. Not audited in homebase.changes v1.",
      inputSchema: {
        duration_seconds: z
          .number()
          .optional()
          .describe("Show length in seconds; default 15, server clamps 1–60"),
      },
    },
    async ({ duration_seconds }) => {
      const result = await runDirigeraPartyMode({
        durationSeconds: duration_seconds,
      });
      return toolJson(result);
    },
  );

  return server;
}
