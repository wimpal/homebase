import { prisma } from "@/core/db";

export interface UpsertSlotInput {
  quantity?: number;
  storeId?: string;
  tags?: string[];
  autoAdded?: boolean;
  /** When true, add quantity to existing needed slot instead of replacing. */
  addQuantity?: boolean;
}

export async function upsertSlot(
  listId: string,
  productId: string,
  productName: string,
  input: UpsertSlotInput = {},
) {
  const quantity = Math.max(1, Math.round(input.quantity ?? 1));

  const existing = await prisma.shoppingItem.findUnique({
    where: {
      shoppingListId_productId: { shoppingListId: listId, productId },
    },
    include: { store: true },
  });

  if (existing) {
    const newQty = input.addQuantity
      ? existing.quantity + quantity
      : quantity;

    return prisma.shoppingItem.update({
      where: { id: existing.id },
      data: {
        name: productName,
        quantity: newQty,
        checked: false,
        ...(input.storeId !== undefined ? { storeId: input.storeId } : {}),
        ...(input.tags !== undefined ? { tags: input.tags } : {}),
        ...(input.autoAdded !== undefined ? { autoAdded: input.autoAdded } : {}),
      },
      include: { store: true },
    });
  }

  return prisma.shoppingItem.create({
    data: {
      shoppingListId: listId,
      productId,
      name: productName,
      quantity,
      checked: false,
      tags: input.tags ?? [],
      storeId: input.storeId,
      autoAdded: input.autoAdded ?? false,
    },
    include: { store: true },
  });
}
