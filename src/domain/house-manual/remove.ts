import { prisma } from "@/core/db";
import { DomainError } from "@/domain/error";
import { deleteUploadByUrl } from "@/core/uploads/service";

export async function removeHouseManualDoc(
  householdId: string,
  id: string,
): Promise<null | DomainError> {
  const existing = await prisma.houseManualDocument.findFirst({
    where: { id, householdId },
  });
  if (!existing) {
    return DomainError.notFound(
      "Document not found.",
      "house_manual_not_found",
    );
  }

  await prisma.houseManualDocument.delete({ where: { id } });
  await deleteUploadByUrl(existing.url);
  return null;
}
