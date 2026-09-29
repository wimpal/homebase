import { prisma } from "@/core/db";
import { DomainError } from "@/domain/error";
import { assertHouseManualEnabled } from "./module-gate";
import {
  HOUSE_MANUAL_BODY_MAX,
  type HouseManualGetResult,
} from "./types";

export async function getHouseManualDoc(
  householdId: string,
  id: string,
): Promise<HouseManualGetResult | DomainError> {
  const gated = await assertHouseManualEnabled(householdId);
  if (gated) return gated;

  const trimmed = id.trim();
  if (!trimmed) {
    return DomainError.invalidInput(
      "Document id is required.",
      "house_manual_id_required",
    );
  }

  const row = await prisma.houseManualDocument.findFirst({
    where: {
      id: trimmed,
      householdId,
      searchable: true,
    },
  });
  if (!row) {
    return DomainError.notFound(
      "Document not found.",
      "house_manual_not_found",
    );
  }

  const truncated = row.extractedText.length > HOUSE_MANUAL_BODY_MAX;
  const body = truncated
    ? row.extractedText.slice(0, HOUSE_MANUAL_BODY_MAX)
    : row.extractedText;

  return {
    id: row.id,
    title: row.title,
    mime: row.mimeType,
    body,
    ...(truncated ? { truncated: true } : {}),
  };
}
