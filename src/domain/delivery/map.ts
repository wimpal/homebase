import type { DeliveryPackage } from "@prisma/client";
import type { DeliveryListItem } from "./types";

function dateOnly(d: Date | null | undefined): string | undefined {
  if (!d) return undefined;
  return d.toISOString().slice(0, 10);
}

function rfc3339(d: Date | null | undefined): string | undefined {
  if (!d) return undefined;
  return d.toISOString();
}

export function toDeliveryListItem(row: DeliveryPackage): DeliveryListItem {
  const item: DeliveryListItem = {
    id: row.id,
    status: row.status,
    updated_at: row.updatedAt.toISOString(),
  };
  if (row.carrier) item.carrier = row.carrier;
  if (row.trackingNumber) item.tracking_number = row.trackingNumber;
  if (row.trackingUrl) item.tracking_url = row.trackingUrl;
  if (row.description) item.description = row.description;
  const expected = dateOnly(row.expectedDate);
  if (expected) item.expected_date = expected;
  const earliest = rfc3339(row.earliestTime);
  if (earliest) item.earliest_time = earliest;
  const latest = rfc3339(row.latestTime);
  if (latest) item.latest_time = latest;
  return item;
}
