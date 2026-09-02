import { prisma } from "@/core/db";
import { DomainError } from "@/domain/error";

export async function findProductByNameCi(householdId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const products = await prisma.product.findMany({
    where: { householdId },
  });
  const needle = trimmed.toLowerCase();
  return products.find((p) => p.name.toLowerCase() === needle) ?? null;
}

export async function upsertProductByName(
  householdId: string,
  name: string,
): Promise<{ id: string; name: string } | DomainError> {
  const trimmed = name.trim();
  if (!trimmed) {
    return DomainError.invalidInput("name is required.");
  }

  const existing = await findProductByNameCi(householdId, trimmed);
  if (existing) {
    return { id: existing.id, name: existing.name };
  }

  try {
    const created = await prisma.product.create({
      data: { householdId, name: trimmed },
      select: { id: true, name: true },
    });
    return created;
  } catch {
    const again = await findProductByNameCi(householdId, trimmed);
    if (again) {
      return { id: again.id, name: again.name };
    }
    return DomainError.invalidInput(
      `A product named "${trimmed}" already exists (case-insensitive).`,
    );
  }
}

export async function canDeleteProduct(
  householdId: string,
  productId: string,
): Promise<{ ok: true } | DomainError> {
  const product = await prisma.product.findFirst({
    where: { id: productId, householdId },
    include: {
      stockItems: true,
      shoppingItems: { where: { checked: false } },
    },
  });

  if (!product) {
    return DomainError.notFound("Product not found.");
  }

  const totalStock = product.stockItems.reduce((s, i) => s + i.quantity, 0);
  if (totalStock > 0) {
    return DomainError.invalidInput(
      "Cannot delete a product with stock on hand.",
    );
  }

  if (product.shoppingItems.length > 0) {
    return DomainError.invalidInput(
      "Cannot delete a product that is currently needed on the shopping list.",
    );
  }

  return { ok: true };
}
