import { prisma } from "@/core/db";
import { DomainError, isDomainError } from "@/domain/error";
import { parseShoppingQuantity } from "@/domain/recipes";
import { markProductNeeded } from "@/domain/shopping/mark-needed";
import { resolvePrimaryListId } from "@/domain/shopping/primary-list";
import { upsertProductByName } from "@/domain/shopping/product-catalog";
import type { AddWeekToShoppingResult } from "./types";
import {
  dateKeyToColumn,
  isDateKey,
  weekDateKeys,
  weekStartKey,
} from "./week";

/**
 * Push the ingredients of a week's planned dinners onto the primary shopping
 * need list (ADR-010). Non-optional ingredients only, deduplicated by name so a
 * shared ingredient lands once. Products that already hold a slot on the list
 * are skipped and their quantity is never touched.
 *
 * Deliberate v1 simplification: no stock/on-hand check. Recipe quantities are
 * free text ("500 g") while stock is an Int, so a quantity-aware diff would be
 * wrong. This is a need-list diff, not a pantry check.
 */
export async function addWeekIngredientsToShopping(
  householdId: string,
  weekStart: string,
): Promise<AddWeekToShoppingResult | DomainError> {
  if (!isDateKey(weekStart)) {
    return DomainError.invalidInput(
      "Week start must be YYYY-MM-DD.",
      "meal_plan_bad_week",
    );
  }
  const start = weekStartKey(weekStart);
  const dates = weekDateKeys(start);

  const entries = await prisma.mealPlanEntry.findMany({
    where: {
      householdId,
      date: { gte: dateKeyToColumn(dates[0]), lte: dateKeyToColumn(dates[6]) },
    },
    include: { recipe: { include: { ingredients: true } } },
  });

  const plannedDays = entries.length;
  if (plannedDays === 0) {
    return { plannedDays, added: [], skipped: [], errors: [] };
  }

  // First occurrence wins so quantity is stable across the week.
  const wanted = new Map<string, string>();
  for (const entry of entries) {
    for (const ing of entry.recipe.ingredients) {
      if (ing.optional) continue;
      const name = ing.name.trim();
      if (!name || wanted.has(name)) continue;
      wanted.set(name, ing.quantity);
    }
  }

  const listId = await resolvePrimaryListId(householdId);
  if (isDomainError(listId)) return listId;

  const added: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  const resolved: Array<{ productId: string; name: string; quantity: string }> = [];
  const seenProducts = new Set<string>();
  for (const [name, quantity] of wanted) {
    const product = await upsertProductByName(householdId, name);
    if (isDomainError(product)) {
      errors.push(`${name}: ${product.message}`);
      continue;
    }
    if (seenProducts.has(product.id)) continue;
    seenProducts.add(product.id);
    resolved.push({ productId: product.id, name: product.name, quantity });
  }

  const existing = await prisma.shoppingItem.findMany({
    where: { shoppingListId: listId, productId: { in: resolved.map((r) => r.productId) } },
    select: { productId: true },
  });
  const onList = new Set(existing.map((item) => item.productId));

  for (const item of resolved) {
    if (onList.has(item.productId)) {
      skipped.push(item.name);
      continue;
    }
    const result = await markProductNeeded(householdId, {
      productId: item.productId,
      name: item.name,
      quantity: parseShoppingQuantity(item.quantity),
      shopping_list_id: listId,
      addQuantity: false,
    });
    if (isDomainError(result)) {
      errors.push(`${item.name}: ${result.message}`);
      continue;
    }
    added.push(item.name);
  }

  return { plannedDays, added, skipped, errors };
}
