import type { DeliveryStatus } from "@prisma/client";

const ALLOWED: Record<DeliveryStatus, ReadonlyArray<DeliveryStatus>> = {
  PENDING: ["IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "EXCEPTION"],
  IN_TRANSIT: ["OUT_FOR_DELIVERY", "DELIVERED", "EXCEPTION", "PENDING"],
  OUT_FOR_DELIVERY: ["DELIVERED", "EXCEPTION", "IN_TRANSIT"],
  DELIVERED: ["EXCEPTION"],
  EXCEPTION: ["PENDING", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"],
};

const ALL_STATUSES = new Set<string>(Object.keys(ALLOWED));

export function isDeliveryStatus(value: string): value is DeliveryStatus {
  return ALL_STATUSES.has(value);
}

export function canTransition(
  from: DeliveryStatus,
  to: DeliveryStatus,
): boolean {
  if (from === to) return true;
  return ALLOWED[from].includes(to);
}

export function allowedNextStatuses(
  from: DeliveryStatus,
): ReadonlyArray<DeliveryStatus> {
  return ALLOWED[from];
}
