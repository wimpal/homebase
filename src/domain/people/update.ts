import { prisma } from "@/core/db";
import { DomainError } from "@/domain/error";
import { toPersonRecord } from "./map";
import type { PersonRecord, PersonWriteInput } from "./types";

function optionalTrim(value: string | null | undefined): string | null {
  if (value == null) return null;
  const t = value.trim();
  return t === "" ? null : t;
}

/**
 * Full-replacement update: blank optional fields clear stored values.
 * `birthday: null` clears; omit is not used — callers always pass all fields.
 */
export async function updatePerson(
  householdId: string,
  id: string,
  input: PersonWriteInput,
): Promise<PersonRecord | DomainError> {
  const existing = await prisma.person.findFirst({
    where: { id, householdId },
  });
  if (!existing) {
    return DomainError.notFound("Person not found.", "person_not_found");
  }

  const name = input.name?.trim() ?? "";
  if (!name) {
    return DomainError.invalidInput("Name is required.", "person_name_required");
  }

  const row = await prisma.person.update({
    where: { id },
    data: {
      name,
      familyName: optionalTrim(input.familyName),
      birthday: input.birthday ?? null,
      phone: optionalTrim(input.phone),
      email: optionalTrim(input.email),
      addressLine: optionalTrim(input.addressLine),
      city: optionalTrim(input.city),
      notes: optionalTrim(input.notes),
    },
  });

  return toPersonRecord(row);
}
