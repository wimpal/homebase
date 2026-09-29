import { prisma } from "@/core/db";
import { deleteUploadsByUrls } from "@/core/uploads/service";
import { DomainError } from "@/domain/error";

export async function deletePerson(
  householdId: string,
  id: string,
): Promise<void | DomainError> {
  const existing = await prisma.person.findFirst({
    where: { id, householdId },
    select: { id: true, photoUrl: true },
  });
  if (!existing) {
    return DomainError.notFound("Person not found.", "person_not_found");
  }

  await prisma.person.delete({ where: { id: existing.id } });
  if (existing.photoUrl) {
    await deleteUploadsByUrls([existing.photoUrl]);
  }
}
