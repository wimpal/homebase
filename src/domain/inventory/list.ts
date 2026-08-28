import { prisma } from "@/core/db";
import { isLowStock, totalQuantity } from "./low-stock";
import type { InventoryListItem, ListInventoryInput, LocationQuantity } from "./types";

const MAX_ITEMS = 200;

type ProductWithStock = Awaited<
  ReturnType<typeof fetchProducts>
>[number];

async function fetchProducts(householdId: string) {
  return prisma.product.findMany({
    where: { householdId },
    include: {
      stockItems: { include: { location: true } },
    },
    orderBy: { name: "asc" },
  });
}

function buildLocations(stockItems: ProductWithStock["stockItems"]): LocationQuantity[] {
  const byLocation = new Map<string, number>();
  for (const item of stockItems) {
    const name = item.location?.name ?? "Unassigned";
    byLocation.set(name, (byLocation.get(name) ?? 0) + item.quantity);
  }
  return [...byLocation.entries()]
    .map(([name, quantity]) => ({ name, quantity }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function toListItem(product: ProductWithStock): InventoryListItem {
  return {
    id: product.id,
    name: product.name,
    category: product.category,
    threshold: product.lowStockAt,
    quantity: totalQuantity(product),
    locations: buildLocations(product.stockItems),
  };
}

function matchesLocation(
  product: ProductWithStock,
  locationFilter: string,
): boolean {
  const needle = locationFilter.trim().toLowerCase();
  if (!needle) return true;
  return product.stockItems.some((item) => {
    const name = item.location?.name ?? "Unassigned";
    return name.toLowerCase() === needle;
  });
}

function sortKey(item: InventoryListItem): string {
  const firstLocation = item.locations[0]?.name ?? "zzz";
  return `${firstLocation.toLowerCase()}\0${item.name.toLowerCase()}`;
}

export async function listInventory(
  householdId: string,
  input: ListInventoryInput = {},
): Promise<InventoryListItem[]> {
  let products = await fetchProducts(householdId);

  if (input.category?.trim()) {
    const category = input.category.trim().toLowerCase();
    products = products.filter(
      (p) => p.category?.toLowerCase() === category,
    );
  }

  if (input.location?.trim()) {
    products = products.filter((p) => matchesLocation(p, input.location!));
  }

  if (input.low_stock_only) {
    products = products.filter((p) => isLowStock(p));
  }

  return products
    .map(toListItem)
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
    .slice(0, MAX_ITEMS);
}

/** Product ids for low-stock dashboard / scheduler parity. */
export async function listLowStockProductIds(householdId: string): Promise<string[]> {
  const items = await listInventory(householdId, { low_stock_only: true });
  return items.map((item) => item.id);
}
