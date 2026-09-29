import { prisma } from "@/core/db";
import { DomainError } from "@/domain/error";
import { toHouseManualDocRecord } from "./map";
import type { HouseManualDocRecord } from "./types";

export async function setHouseManualSearchable(
  householdId: string,
  id: string,
  searchable: boolean,
): Promise<HouseManualDocRecord | DomainError> {
  const existing = await prisma.houseManualDocument.findFirst({
    where: { id, householdId },
  });
  if (!existing) {
    return DomainError.notFound(
      "Document not found.",
      "house_manual_not_found",
    );
  }

  const row = await prisma.houseManualDocument.update({
    where: { id },
    data: { searchable },
  });
  return toHouseManualDocRecord(row);
}
