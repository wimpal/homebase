import { prisma } from "@/core/db";
import { DomainError } from "@/domain/error";
import { toShoppingListItem } from "./map-item";
import { reduceStockAfterUnbuy } from "./stock-on-purchase";
import type { ShoppingListItem } from "./types";

/**
 * Undo a mistaken buy: restore needed slot, remove latest matching purchase
 * event, and reverse stock bump when stock-tracked.
 */
export async function unmarkShoppingItemBought(
  householdId: string,
  id: string,
): Promise<ShoppingListItem | DomainError> {
  const slot = await prisma.shoppingItem.findFirst({
    where: {
      id,
      shoppingList: { householdId },
    },
    include: { store: true, product: true },
  });

  if (!slot) {
    return DomainError.notFound("Shopping item not found.");
  }

  if (!slot.checked) {
    return toShoppingListItem(slot);
  }

  await prisma.$transaction(async (tx) => {
    const latest = await tx.purchaseEvent.findFirst({
      where: {
        householdId,
        productId: slot.productId,
        quantity: slot.quantity,
      },
      orderBy: { purchasedAt: "desc" },
    });

    // Prefer quantity match; fall back to latest event for this product.
    const event =
      latest ??
      (await tx.purchaseEvent.findFirst({
        where: { householdId, productId: slot.productId },
        orderBy: { purchasedAt: "desc" },
      }));

    if (event) {
      await tx.purchaseEvent.delete({ where: { id: event.id } });
    }

    const previous = await tx.purchaseEvent.findFirst({
      where: { householdId, productId: slot.productId },
      orderBy: { purchasedAt: "desc" },
    });

    await tx.product.update({
      where: { id: slot.productId },
      data: { lastPurchasedAt: previous?.purchasedAt ?? null },
    });

    await tx.shoppingItem.update({
      where: { id: slot.id },
      data: { checked: false },
    });
  });

  await reduceStockAfterUnbuy(householdId, slot.productId, slot.quantity);

  const updated = await prisma.shoppingItem.findUniqueOrThrow({
    where: { id: slot.id },
    include: { store: true },
  });

  return toShoppingListItem(updated);
}
