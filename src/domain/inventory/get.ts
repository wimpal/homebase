import { prisma } from "@/core/db";
import { DomainError } from "@/domain/error";
import { totalQuantity } from "./low-stock";
import type { InventoryDetail, LocationQuantity, StockItemDetail } from "./types";

function buildLocations(
  stockItems: {
    quantity: number;
    location: { name: string } | null;
  }[],
): LocationQuantity[] {
  const byLocation = new Map<string, number>();
  for (const item of stockItems) {
    const name = item.location?.name ?? "Unassigned";
    byLocation.set(name, (byLocation.get(name) ?? 0) + item.quantity);
  }
  return [...byLocation.entries()]
    .map(([name, quantity]) => ({ name, quantity }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getInventory(
  householdId: string,
  id: string,
): Promise<InventoryDetail | DomainError> {
  const product = await prisma.product.findFirst({
    where: { id, householdId },
    include: {
      stockItems: { include: { location: true } },
      barcodes: true,
    },
  });

  if (!product) {
    return DomainError.notFound(`No inventory product with id ${id}.`);
  }

  const stock_items: StockItemDetail[] = product.stockItems.map((item) => ({
    id: item.id,
    quantity: item.quantity,
    location: item.location?.name ?? null,
    expiry_date: item.expiryDate?.toISOString().slice(0, 10) ?? null,
    updated_at: item.updatedAt.toISOString(),
  }));

  return {
    id: product.id,
    name: product.name,
    category: product.category,
    threshold: product.lowStockAt,
    quantity: totalQuantity(product),
    locations: buildLocations(product.stockItems),
    stock_items,
    barcodes: product.barcodes.map((b) => b.code),
  };
}
