import { prisma } from "@/core/db";

function pickPrimaryStockItem<
  T extends { id: string; quantity: number; createdAt: Date },
>(stockItems: T[]): T | undefined {
  if (stockItems.length === 0) return undefined;
  return [...stockItems].sort((a, b) => {
    if (b.quantity !== a.quantity) {
      return b.quantity - a.quantity;
    }
    return a.createdAt.getTime() - b.createdAt.getTime();
  })[0];
}

/** Bump primary stock row by delta when product is stock-tracked. */
export async function bumpStockOnPurchase(
  householdId: string,
  productId: string,
  delta: number,
): Promise<void> {
  if (delta <= 0) return;

  const product = await prisma.product.findFirst({
    where: { id: productId, householdId },
    include: { stockItems: true },
  });

  if (!product || product.stockItems.length === 0) {
    return;
  }

  const primary = pickPrimaryStockItem(product.stockItems);
  if (primary) {
    await prisma.stockItem.update({
      where: { id: primary.id },
      data: { quantity: primary.quantity + delta },
    });
  }
}
