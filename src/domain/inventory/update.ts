import { prisma } from "@/core/db";
import { DomainError, isDomainError } from "@/domain/error";
import { getInventory } from "./get";
import { totalQuantity } from "./low-stock";
import type { InventoryDetail } from "./types";

export interface UpdateInventoryInput {
  id: string;
  quantity?: number;
  delta?: number;
}

function hasQuantity(value: number | undefined): boolean {
  return value !== undefined && value !== null;
}

function pickPrimaryStockItem<
  T extends { id: string; quantity: number; createdAt: Date },
>(stockItems: T[]): T | undefined {
  if (stockItems.length === 0) {
    return undefined;
  }
  return [...stockItems].sort((a, b) => {
    if (b.quantity !== a.quantity) {
      return b.quantity - a.quantity;
    }
    return a.createdAt.getTime() - b.createdAt.getTime();
  })[0];
}

/**
 * MCP inventory.update adjusts one primary stock row (highest quantity, earliest
 * createdAt on tie). Other location rows are unchanged — multi-location totals may
 * not match `quantity` when several stock rows exist.
 */
export async function updateInventory(
  householdId: string,
  input: UpdateInventoryInput,
): Promise<InventoryDetail | DomainError> {
  const hasQty = hasQuantity(input.quantity);
  const hasDelta = hasQuantity(input.delta);
  if (hasQty === hasDelta) {
    return DomainError.invalidInput(
      "Provide exactly one of quantity or delta.",
    );
  }

  const product = await prisma.product.findFirst({
    where: { id: input.id, householdId },
    include: { stockItems: true },
  });

  if (!product) {
    return DomainError.notFound(`No inventory product with id ${input.id}.`);
  }

  const currentTotal = totalQuantity(product);
  const targetTotal = hasQty
    ? input.quantity!
    : currentTotal + input.delta!;

  if (!Number.isFinite(targetTotal) || targetTotal < 0) {
    return DomainError.invalidInput(
      "Resulting quantity cannot be negative.",
    );
  }

  const roundedTarget = Math.round(targetTotal);
  const adjustment = roundedTarget - currentTotal;

  if (adjustment === 0) {
    const result = await getInventory(householdId, input.id);
    if (isDomainError(result)) {
      return result;
    }
    return result;
  }

  const primary = pickPrimaryStockItem(product.stockItems);

  if (!primary) {
    if (roundedTarget === 0) {
      const result = await getInventory(householdId, input.id);
      if (isDomainError(result)) {
        return result;
      }
      return result;
    }
    await prisma.stockItem.create({
      data: {
        householdId,
        productId: product.id,
        quantity: roundedTarget,
      },
    });
  } else {
    const newPrimaryQty = primary.quantity + adjustment;
    if (newPrimaryQty < 0) {
      return DomainError.invalidInput(
        "Adjustment would make primary stock negative; use a smaller delta.",
      );
    }
    await prisma.stockItem.update({
      where: { id: primary.id },
      data: { quantity: newPrimaryQty },
    });
  }

  const result = await getInventory(householdId, input.id);
  if (isDomainError(result)) {
    return result;
  }
  return result;
}
