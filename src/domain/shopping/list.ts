import { prisma } from "@/core/db";
import { DomainError, isDomainError } from "@/domain/error";
import { resolvePrimaryListId } from "./primary-list";
import type { ListShoppingInput, ShoppingListItem } from "./types";

export async function listShoppingItems(
  householdId: string,
  input: ListShoppingInput = {},
): Promise<ShoppingListItem[] | DomainError> {
  const listId = await resolvePrimaryListId(householdId);
  if (isDomainError(listId)) {
    return listId;
  }

  const includeChecked =
    input.include_checked ?? input.include_done ?? false;

  const items = await prisma.shoppingItem.findMany({
    where: {
      shoppingListId: listId,
      ...(includeChecked ? {} : { checked: false }),
    },
    include: { store: true },
    orderBy: { createdAt: "asc" },
  });

  return items.map((item) => ({
    id: item.id,
    name: item.name,
    quantity: item.quantity,
    checked: item.checked,
    added_at: item.createdAt.toISOString(),
    auto_added: item.autoAdded,
    ...(item.store ? { store: item.store.name } : {}),
  }));
}
