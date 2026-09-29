import type { DeliveryStatus } from "@prisma/client";

export type DeliveryStatusValue = DeliveryStatus;

export interface DeliveryListItem {
  id: string;
  carrier?: string;
  tracking_number?: string;
  tracking_url?: string;
  description?: string;
  status: DeliveryStatusValue;
  expected_date?: string;
  earliest_time?: string;
  latest_time?: string;
  updated_at: string;
}

export interface ListDeliveriesInput {
  status?: string;
}

export interface AddDeliveryInput {
  description: string;
  carrier?: string;
  tracking_number?: string;
  tracking_url?: string;
  expected_date?: string;
  earliest_time?: string;
  latest_time?: string;
}

export interface SetDeliveryStatusInput {
  id: string;
  status: string;
}
