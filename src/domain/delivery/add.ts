import { prisma } from "@/core/db";
import { DomainError } from "@/domain/error";
import { parseISO } from "date-fns";
import { toDeliveryListItem } from "./map";
import type { AddDeliveryInput, DeliveryListItem } from "./types";

function parseOptionalDate(
  value: string | undefined,
  field: string,
): Date | undefined | DomainError {
  if (!value?.trim()) return undefined;
  const d = parseISO(value.trim());
  if (Number.isNaN(d.getTime())) {
    return DomainError.invalidInput(
      `Invalid ${field}.`,
      "invalid_delivery_date",
    );
  }
  return d;
}

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export async function addDelivery(
  householdId: string,
  input: AddDeliveryInput,
): Promise<DeliveryListItem | DomainError> {
  const description = input.description?.trim() ?? "";
  if (!description) {
    return DomainError.invalidInput(
      "description is required.",
      "description_required",
    );
  }

  const trackingUrl = input.tracking_url?.trim() || undefined;
  if (trackingUrl && !isHttpUrl(trackingUrl)) {
    return DomainError.invalidInput(
      "tracking_url must be an http or https URL.",
      "invalid_tracking_url",
    );
  }

  const expectedDate = parseOptionalDate(input.expected_date, "expected_date");
  if (expectedDate instanceof DomainError) return expectedDate;
  const earliestTime = parseOptionalDate(input.earliest_time, "earliest_time");
  if (earliestTime instanceof DomainError) return earliestTime;
  const latestTime = parseOptionalDate(input.latest_time, "latest_time");
  if (latestTime instanceof DomainError) return latestTime;

  const row = await prisma.deliveryPackage.create({
    data: {
      householdId,
      description,
      carrier: input.carrier?.trim() || undefined,
      trackingNumber: input.tracking_number?.trim() || undefined,
      trackingUrl,
      expectedDate,
      earliestTime,
      latestTime,
    },
  });

  return toDeliveryListItem(row);
}
