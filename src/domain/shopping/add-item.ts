import { prisma } from "@/core/db";
import { recordMcpChange } from "@/domain/changes";
import { DomainError, isDomainError } from "@/domain/error";
import { resolvePrimaryListId } from "./primary-list";
import type {
  AddShoppingItemInput,
  ShoppingListItem,
  ShoppingListItemWithChange,
} from "./types";

function toShoppingListItem(item: {
  id: string;
  name: string;
  quantity: number;
  checked: boolean;
  createdAt: Date;
  autoAdded: boolean;
  store: { name: string } | null;
}): ShoppingListItem {
  return {
    id: item.id,
    name: item.name,
    quantity: item.quantity,
    checked: item.checked,
    added_at: item.createdAt.toISOString(),
    auto_added: item.autoAdded,
    ...(item.store ? { store: item.store.name } : {}),
  };
}

async function matchProductId(
  householdId: string,
  name: string,
): Promise<string | undefined> {
  const products = await prisma.product.findMany({
    where: { householdId },
    select: { id: true, name: true },
  });
  const needle = name.toLowerCase();
  return products.find((p) => p.name.toLowerCase() === needle)?.id;
}

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
    if (isDomainError(resolved)) {
      return resolved;
    }
    listId = resolved;
  }

  const productId = await matchProductId(householdId, name);

  const item = await prisma.shoppingItem.create({
    data: {
      shoppingListId: listId,
      name,
      quantity: Math.round(quantity),
      productId,
      autoAdded: false,
      tags: input.tags ?? [],
      storeId: input.store_id,
    },
    include: { store: true },
  });

  const created = toShoppingListItem(item);

  if (input.mcp_audit) {
    const change_id = await recordMcpChange(householdId, {
      tool_name: input.mcp_audit.tool_name,
      entity_type: "shopping_item",
      entity_id: item.id,
      payload: {
        input: { name, quantity: Math.round(quantity), unit: input.unit },
        created: {
          id: item.id,
          name: item.name,
          quantity: item.quantity,
        },
      },
    });
    return { ...created, change_id };
  }

  return created;
}
