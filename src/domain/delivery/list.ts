import { prisma } from "@/core/db";
import { DomainError } from "@/domain/error";
import type { Prisma } from "@prisma/client";
import { toDeliveryListItem } from "./map";
import { isDeliveryStatus } from "./transitions";
import type { DeliveryListItem, ListDeliveriesInput } from "./types";

const LIST_CAP = 100;

export async function listDeliveries(
  householdId: string,
  input: ListDeliveriesInput = {},
): Promise<DeliveryListItem[] | DomainError> {
  const where: Prisma.DeliveryPackageWhereInput = { householdId };

  if (input.status?.trim()) {
    const status = input.status.trim().toUpperCase();
    if (!isDeliveryStatus(status)) {
      return DomainError.invalidInput(
        `Unknown delivery status ${input.status}.`,
        "invalid_delivery_status",
      );
    }
    where.status = status;
  }

  const rows = await prisma.deliveryPackage.findMany({
    where,
    orderBy: [{ expectedDate: "asc" }, { createdAt: "asc" }],
    take: LIST_CAP,
  });

  // Prisma sorts null expectedDate first on asc; put nulls last for MCP contract.
  rows.sort((a, b) => {
    if (a.expectedDate === null && b.expectedDate !== null) return 1;
    if (a.expectedDate !== null && b.expectedDate === null) return -1;
    if (a.expectedDate && b.expectedDate) {
      const byDate = a.expectedDate.getTime() - b.expectedDate.getTime();
      if (byDate !== 0) return byDate;
    }
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  return rows.map(toDeliveryListItem);
}
