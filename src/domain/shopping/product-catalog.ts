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
      "product_name_exists",
    );
  }
}

export type ImportProductOutcome = "created" | "updated" | "unchanged";

export interface ImportProductFields {
  name: string;
  /** Non-empty only — blank does not clear existing. */
  category?: string;
  description?: string;
}

export interface ImportProductResult {
  id: string;
  name: string;
  outcome: ImportProductOutcome;
}

/** Preload household products into a case-insensitive name map (first wins). */
export async function loadProductNameMap(
  householdId: string,
): Promise<Map<string, { id: string; name: string; category: string | null; description: string | null }>> {
  const products = await prisma.product.findMany({
    where: { householdId },
    select: { id: true, name: true, category: true, description: true },
  });
  const map = new Map<
    string,
    { id: string; name: string; category: string | null; description: string | null }
  >();
  for (const p of products) {
    const key = p.name.trim().toLowerCase();
    if (!map.has(key)) map.set(key, p);
  }
  return map;
}

/**
 * Create or update a Product for Notion/catalog import.
 * Blank category/description never clear existing values.
 * Mutates `nameMap` so subsequent rows in the same run stay consistent.
 */
export async function upsertProductFromImport(
  householdId: string,
  fields: ImportProductFields,
  nameMap: Map<
    string,
    { id: string; name: string; category: string | null; description: string | null }
  >,
): Promise<ImportProductResult | DomainError> {
  const trimmed = fields.name.trim();
  if (!trimmed) {
    return DomainError.invalidInput("name is required.", "import_name_required");
  }

  const key = trimmed.toLowerCase();
  const existing = nameMap.get(key);

  if (existing) {
    const data: { category?: string; description?: string } = {};
    if (fields.category && fields.category !== existing.category) {
      data.category = fields.category;
    }
    if (fields.description && fields.description !== existing.description) {
      data.description = fields.description;
    }

    if (Object.keys(data).length === 0) {
      return { id: existing.id, name: existing.name, outcome: "unchanged" };
    }

    const updated = await prisma.product.update({
      where: { id: existing.id },
      data,
      select: { id: true, name: true, category: true, description: true },
    });
    nameMap.set(key, updated);
    return { id: updated.id, name: updated.name, outcome: "updated" };
  }

  try {
    const created = await prisma.product.create({
      data: {
        householdId,
        name: trimmed,
        ...(fields.category ? { category: fields.category } : {}),
        ...(fields.description ? { description: fields.description } : {}),
      },
      select: { id: true, name: true, category: true, description: true },
    });
    nameMap.set(key, created);
    return { id: created.id, name: created.name, outcome: "created" };
  } catch {
    const again = await findProductByNameCi(householdId, trimmed);
    if (again) {
      nameMap.set(key, {
        id: again.id,
        name: again.name,
        category: again.category,
        description: again.description,
      });
      return upsertProductFromImport(householdId, fields, nameMap);
    }
    return DomainError.invalidInput(
      `A product named "${trimmed}" already exists (case-insensitive).`,
      "product_name_exists",
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
    return DomainError.notFound("Product not found.", "product_not_found");
  }

  const totalStock = product.stockItems.reduce((s, i) => s + i.quantity, 0);
  if (totalStock > 0) {
    return DomainError.invalidInput(
      "Cannot delete a product with stock on hand.",
      "product_has_stock",
    );
  }

  if (product.shoppingItems.length > 0) {
    return DomainError.invalidInput(
      "Cannot delete a product that is currently needed on the shopping list.",
      "product_on_shopping_list",
    );
  }

  return { ok: true };
}

export interface UpdateCatalogProductInput {
  id: string;
  name: string;
  /** Empty string clears category. */
  category?: string | null;
}

/**
 * Update catalog product name/category. Keeps shopping-slot `name` in sync.
 * Case-insensitive name uniqueness within the household.
 */
export async function updateCatalogProduct(
  householdId: string,
  input: UpdateCatalogProductInput,
): Promise<{ id: string; name: string; category: string | null } | DomainError> {
  const trimmed = input.name.trim();
  if (!trimmed) {
    return DomainError.invalidInput("name is required.");
  }

  const existing = await prisma.product.findFirst({
    where: { id: input.id, householdId },
    select: { id: true, name: true, category: true },
  });
  if (!existing) {
    return DomainError.notFound("Product not found.", "product_not_found");
  }

  const clash = await findProductByNameCi(householdId, trimmed);
  if (clash && clash.id !== input.id) {
    return DomainError.invalidInput(
      `A product named "${trimmed}" already exists (case-insensitive).`,
      "product_name_exists",
    );
  }

  const category =
    input.category === undefined
      ? existing.category
      : input.category === null || input.category.trim() === ""
        ? null
        : input.category.trim();

  const updated = await prisma.$transaction(async (tx) => {
    const product = await tx.product.update({
      where: { id: input.id },
      data: { name: trimmed, category },
      select: { id: true, name: true, category: true },
    });

    if (product.name !== existing.name) {
      await tx.shoppingItem.updateMany({
        where: { productId: product.id },
        data: { name: product.name },
      });
    }

    return product;
  });

  return updated;
}
