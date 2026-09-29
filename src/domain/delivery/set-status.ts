import { prisma } from "@/core/db";
import { assertDelivery } from "@/core/tenancy/assertHouseholdResource";
import { DomainError } from "@/domain/error";
import { toDeliveryListItem } from "./map";
import { canTransition, isDeliveryStatus } from "./transitions";
import type { DeliveryListItem, SetDeliveryStatusInput } from "./types";

export async function setDeliveryStatus(
  householdId: string,
  input: SetDeliveryStatusInput,
): Promise<DeliveryListItem | DomainError> {
  const statusRaw = input.status?.trim().toUpperCase() ?? "";
  if (!isDeliveryStatus(statusRaw)) {
    return DomainError.invalidInput(
      "Invalid delivery status.",
      "invalid_delivery_status",
    );
  }

  let existing;
  try {
    existing = await assertDelivery(householdId, input.id);
  } catch {
    return DomainError.notFound("Delivery not found.", "delivery_not_found");
  }

  if (existing.status === statusRaw) {
    return toDeliveryListItem(existing);
  }

  if (!canTransition(existing.status, statusRaw)) {
    return DomainError.invalidInput(
      `Cannot change status from ${existing.status} to ${statusRaw}.`,
      "invalid_delivery_transition",
    );
  }

  const result = await prisma.deliveryPackage.updateMany({
    where: { id: input.id, householdId, status: existing.status },
    data: { status: statusRaw },
  });

  if (result.count === 0) {
    // Concurrent change or vanished row.
    try {
      await assertDelivery(householdId, input.id);
    } catch {
      return DomainError.notFound("Delivery not found.", "delivery_not_found");
    }
    return DomainError.conflict(
      "Delivery status changed concurrently. List again and retry.",
      "delivery_status_conflict",
    );
  }

  const updated = await prisma.deliveryPackage.findFirst({
    where: { id: input.id, householdId },
  });
  if (!updated) {
    return DomainError.notFound("Delivery not found.", "delivery_not_found");
  }
  return toDeliveryListItem(updated);
}
