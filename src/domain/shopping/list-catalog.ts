import { prisma } from "@/core/db";
import { DomainError, isDomainError } from "@/domain/error";
import { resolvePrimaryListId } from "./primary-list";

export interface CatalogProduct {
  id: string;
  name: string;
  category: string | null;
  last_purchased_at: string | null;
  needed: boolean;
  slot_id: string | null;
}

export async function listCatalogProducts(
  householdId: string,
): Promise<CatalogProduct[] | DomainError> {
  const listId = await resolvePrimaryListId(householdId);
  if (isDomainError(listId)) {
    return listId;
  }

  const [products, neededSlots] = await Promise.all([
    prisma.product.findMany({
      where: { householdId },
      orderBy: [{ lastPurchasedAt: "desc" }, { name: "asc" }],
    }),
    prisma.shoppingItem.findMany({
      where: { shoppingListId: listId, checked: false },
      select: { id: true, productId: true },
    }),
  ]);

  const neededByProduct = new Map(
    neededSlots.map((s) => [s.productId, s.id]),
  );

  return products.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    last_purchased_at: p.lastPurchasedAt?.toISOString() ?? null,
    needed: neededByProduct.has(p.id),
    slot_id: neededByProduct.get(p.id) ?? null,
  }));
}
