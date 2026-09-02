import { prisma } from "@/core/db";
import { DomainError } from "@/domain/error";
import { toShoppingListItem } from "./map-item";
import { bumpStockOnPurchase } from "./stock-on-purchase";
import type { ShoppingListItem } from "./types";

export interface MarkBoughtInput {
  id: string;
  update_inventory?: boolean;
  source?: string;
}

export async function markShoppingItemBought(
  householdId: string,
  input: MarkBoughtInput,
): Promise<ShoppingListItem | DomainError> {
  const slot = await prisma.shoppingItem.findFirst({
    where: {
      id: input.id,
      shoppingList: { householdId },
    },
    include: { store: true, product: true },
  });

  if (!slot) {
    return DomainError.notFound("Shopping item not found.");
  }

  if (slot.checked) {
    return toShoppingListItem(slot);
  }

  const now = new Date();
  const source = input.source ?? "manual";
  const updateInventory = input.update_inventory !== false;

  await prisma.$transaction(async (tx) => {
    await tx.purchaseEvent.create({
      data: {
        householdId,
        productId: slot.productId,
        quantity: slot.quantity,
        purchasedAt: now,
        source,
      },
    });

    await tx.product.update({
      where: { id: slot.productId },
      data: { lastPurchasedAt: now },
    });

    await tx.shoppingItem.update({
      where: { id: slot.id },
      data: { checked: true, name: slot.product.name },
    });
  });

  if (updateInventory) {
    await bumpStockOnPurchase(householdId, slot.productId, slot.quantity);
  }

  const updated = await prisma.shoppingItem.findUniqueOrThrow({
    where: { id: slot.id },
    include: { store: true },
  });

  return toShoppingListItem(updated);
}
