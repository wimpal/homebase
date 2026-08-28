import { prisma } from "@/core/db";
import { recordMcpChange } from "@/domain/changes";
import type { InventorySnapshot } from "@/domain/changes/types";
import { DomainError, isDomainError } from "@/domain/error";
import { getInventory } from "./get";
import { totalQuantity } from "./low-stock";
import type { InventoryDetail } from "./types";

export interface UpdateInventoryInput {
  id: string;
  quantity?: number;
  delta?: number;
  /** When set, append an MCP audit row and return change_id. */
  mcp_audit?: { tool_name: string };
}

export type InventoryDetailWithChange = InventoryDetail & {
  change_id?: string;
};

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

function toSnapshot(
  productId: string,
  stockItems: { id: string; quantity: number }[],
): InventorySnapshot {
  return {
    product_id: productId,
    total: stockItems.reduce((sum, item) => sum + item.quantity, 0),
    stock_items: stockItems.map((item) => ({
      id: item.id,
      quantity: item.quantity,
    })),
  };
}

/**
 * MCP inventory.update adjusts one primary stock row (highest quantity, earliest
 * createdAt on tie). Other location rows are unchanged — multi-location totals may
 * not match `quantity` when several stock rows exist. Revert restores the before
 * snapshot stored in the audit payload.
 */
export async function updateInventory(
  householdId: string,
  input: UpdateInventoryInput,
): Promise<InventoryDetailWithChange | DomainError> {
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

  const beforeSnapshot = toSnapshot(product.id, product.stockItems);
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

  if (input.mcp_audit) {
    const afterProduct = await prisma.product.findFirst({
      where: { id: product.id, householdId },
      include: { stockItems: true },
    });
    const afterSnapshot = afterProduct
      ? toSnapshot(afterProduct.id, afterProduct.stockItems)
      : toSnapshot(product.id, []);

    const change_id = await recordMcpChange(householdId, {
      tool_name: input.mcp_audit.tool_name,
      entity_type: "inventory_update",
      entity_id: product.id,
      payload: {
        input: {
          id: input.id,
          ...(hasQty ? { quantity: input.quantity } : { delta: input.delta }),
        },
        product_name: product.name,
        before: beforeSnapshot,
        after: afterSnapshot,
      },
    });
    return { ...result, change_id };
  }

  return result;
}
