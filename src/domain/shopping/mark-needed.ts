import { prisma } from "@/core/db";
import { DomainError, isDomainError } from "@/domain/error";
import { toShoppingListItem } from "./map-item";
import { resolvePrimaryListId } from "./primary-list";
import { upsertProductByName } from "./product-catalog";
import { upsertSlot } from "./slot";
import type { ShoppingListItem } from "./types";

export interface MarkNeededInput {
  productId?: string;
  name?: string;
  quantity?: number;
  store_id?: string;
  tags?: string[];
  shopping_list_id?: string;
  autoAdded?: boolean;
  addQuantity?: boolean;
}

export async function markProductNeeded(
  householdId: string,
  input: MarkNeededInput,
): Promise<ShoppingListItem | DomainError> {
  let productId = input.productId;
  let productName: string;

  if (productId) {
    const product = await prisma.product.findFirst({
      where: { id: productId, householdId },
      select: { id: true, name: true },
    });
    if (!product) {
      return DomainError.notFound("Product not found.");
    }
    productName = product.name;
  } else if (input.name) {
    const resolved = await upsertProductByName(householdId, input.name);
    if (isDomainError(resolved)) return resolved;
    productId = resolved.id;
    productName = resolved.name;
  } else {
    return DomainError.invalidInput("productId or name is required.");
  }

  let listId: string;
  if (input.shopping_list_id) {
    const list = await prisma.shoppingList.findFirst({
      where: { id: input.shopping_list_id, householdId },
      select: { id: true },
    });
    if (!list) {
      return DomainError.notFound("Shopping list not found.");
    }
    listId = list.id;
  } else {
    const resolved = await resolvePrimaryListId(householdId);
    if (isDomainError(resolved)) return resolved;
    listId = resolved;
  }

  const item = await upsertSlot(listId, productId, productName, {
    quantity: input.quantity,
    storeId: input.store_id,
    tags: input.tags,
    autoAdded: input.autoAdded,
    addQuantity: input.addQuantity,
  });

  return toShoppingListItem(item);
}
