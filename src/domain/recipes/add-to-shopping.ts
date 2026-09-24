import { prisma } from "@/core/db";
import { DomainError, isDomainError } from "@/domain/error";
import { markProductNeeded } from "@/domain/shopping/mark-needed";
import { resolvePrimaryListId } from "@/domain/shopping/primary-list";
import { upsertProductByName } from "@/domain/shopping/product-catalog";

export type AddRecipeToShoppingResult = {
  added: string[];
  skipped: string[];
  errors: string[];
};

/** Leading integer from free-text quantity; default 1. */
export function parseShoppingQuantity(quantity: string): number {
  const match = quantity.trim().match(/^(\d+)/);
  if (!match) return 1;
  const n = parseInt(match[1], 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/**
 * Add recipe ingredients to the primary shopping need-list.
 * Skips optional ingredients unless includeOptional.
 * Idempotent: if product already on the list (any quantity), skip — no quantity spam.
 */
export async function addRecipeIngredientsToShopping(
  householdId: string,
  recipeId: string,
  includeOptional = false,
): Promise<AddRecipeToShoppingResult | DomainError> {
  const recipe = await prisma.recipe.findFirst({
    where: { id: recipeId, householdId },
    include: { ingredients: true },
  });
  if (!recipe) {
    return DomainError.notFound("Recipe not found.");
  }

  const listId = await resolvePrimaryListId(householdId);
  if (isDomainError(listId)) return listId;

  const added: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  const ingredients = recipe.ingredients.filter(
    (ing) => includeOptional || !ing.optional,
  );

  for (const ing of ingredients) {
    const name = ing.name.trim();
    if (!name) continue;

    const product = await upsertProductByName(householdId, name);
    if (isDomainError(product)) {
      errors.push(`${name}: ${product.message}`);
      continue;
    }

    const existing = await prisma.shoppingItem.findUnique({
      where: {
        shoppingListId_productId: {
          shoppingListId: listId,
          productId: product.id,
        },
      },
      select: { id: true },
    });

    if (existing) {
      skipped.push(name);
      continue;
    }

    const quantity = parseShoppingQuantity(ing.quantity);
    const result = await markProductNeeded(householdId, {
      productId: product.id,
      name: product.name,
      quantity,
      shopping_list_id: listId,
      addQuantity: false,
    });
    if (isDomainError(result)) {
      errors.push(`${name}: ${result.message}`);
      continue;
    }
    added.push(name);
  }

  return { added, skipped, errors };
}
