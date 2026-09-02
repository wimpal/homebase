import { DomainError, isDomainError } from "@/domain/error";
import { markShoppingItemBought, type MarkBoughtInput } from "./mark-bought";
import type { ShoppingListItem } from "./types";

export async function completeShoppingItem(
  householdId: string,
  input: MarkBoughtInput,
): Promise<ShoppingListItem | DomainError> {
  const result = await markShoppingItemBought(householdId, {
    ...input,
    source: input.source ?? "mcp",
  });
  if (isDomainError(result)) {
    return result;
  }
  return result;
}
