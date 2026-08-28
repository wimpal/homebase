import { prisma } from "@/core/db";
import { DomainError } from "@/domain/error";
import type { InventorySnapshot, RevertMcpChangeResult } from "./types";

async function revertShoppingItem(
  householdId: string,
  entityId: string,
): Promise<void> {
  const result = await prisma.shoppingItem.deleteMany({
    where: {
      id: entityId,
      shoppingList: { householdId },
    },
  });
  if (result.count === 0) {
    throw DomainError.notFound("Shopping item not found or already removed.");
  }
}

async function revertInventoryUpdate(payload: Record<string, unknown>): Promise<void> {
  const before = payload.before as InventorySnapshot | undefined;
  const after = payload.after as InventorySnapshot | undefined;
  if (!before || !after) {
    throw DomainError.internal("Missing inventory snapshot in change payload.");
  }

  const beforeIds = new Set(before.stock_items.map((item) => item.id));

  for (const item of before.stock_items) {
    await prisma.stockItem.update({
      where: { id: item.id },
      data: { quantity: item.quantity },
    });
  }

  const createdIds = after.stock_items
    .map((item) => item.id)
    .filter((id) => !beforeIds.has(id));

  if (createdIds.length > 0) {
    await prisma.stockItem.deleteMany({
      where: { id: { in: createdIds } },
    });
  }
}

export async function revertMcpChange(
  householdId: string,
  changeId: string,
): Promise<RevertMcpChangeResult | DomainError> {
  const id = changeId.trim();
  if (!id) {
    return DomainError.invalidInput("change_id is required.");
  }

  const row = await prisma.mcpChangeLog.findFirst({
    where: { id, householdId },
  });

  if (!row) {
    return DomainError.invalidInput(`Unknown change_id "${id}".`);
  }

  if (row.revertedAt) {
    return DomainError.invalidInput(`Change "${id}" was already reverted.`);
  }

  const payload = row.payloadJson as Record<string, unknown>;

  try {
    switch (row.entityType) {
      case "shopping_item":
        await revertShoppingItem(householdId, row.entityId);
        break;
      case "inventory_update":
        await revertInventoryUpdate(payload);
        break;
      default:
        return DomainError.invalidInput(
          `Cannot revert entity type "${row.entityType}".`,
        );
    }
  } catch (err) {
    if (err instanceof DomainError) {
      return err;
    }
    throw err;
  }

  const revertedAt = new Date();
  await prisma.mcpChangeLog.update({
    where: { id: row.id },
    data: { revertedAt },
  });

  return {
    change_id: row.id,
    reverted_at: revertedAt.toISOString(),
    entity_type: row.entityType,
    entity_id: row.entityId,
  };
}
