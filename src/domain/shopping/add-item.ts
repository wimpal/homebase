import { recordMcpChange } from "@/domain/changes";
import { DomainError, isDomainError } from "@/domain/error";
import { markProductNeeded } from "./mark-needed";
import { toShoppingListItem } from "./map-item";
import type {
  AddShoppingItemInput,
  ShoppingListItem,
  ShoppingListItemWithChange,
} from "./types";

export async function addShoppingListItem(
  householdId: string,
  input: AddShoppingItemInput,
): Promise<ShoppingListItemWithChange | DomainError> {
  const name = input.name.trim();
  if (!name) {
    return DomainError.invalidInput("name is required.");
  }

  const quantity = input.quantity ?? 1;
  if (!Number.isFinite(quantity) || quantity < 1) {
    return DomainError.invalidInput("quantity must be a positive number.");
  }

  const result = await markProductNeeded(householdId, {
    name,
    quantity: Math.round(quantity),
    store_id: input.store_id,
    tags: input.tags,
    shopping_list_id: input.shopping_list_id,
    addQuantity: true,
  });

  if (isDomainError(result)) {
    return result;
  }

  if (input.mcp_audit) {
    const change_id = await recordMcpChange(householdId, {
      tool_name: input.mcp_audit.tool_name,
      entity_type: "shopping_item",
      entity_id: result.id,
      payload: {
        input: { name, quantity: Math.round(quantity), unit: input.unit },
        created: {
          id: result.id,
          name: result.name,
          quantity: result.quantity,
        },
      },
    });
    return { ...result, change_id };
  }

  return result;
}
