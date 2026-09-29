import { prisma } from "@/core/db";
import { DomainError } from "@/domain/error";
import { toPersonRecord } from "./map";
import type { PersonRecord, PersonWriteInput } from "./types";

function optionalTrim(value: string | null | undefined): string | null {
  if (value == null) return null;
  const t = value.trim();
  return t === "" ? null : t;
}

export async function createPerson(
  householdId: string,
  input: PersonWriteInput,
): Promise<PersonRecord | DomainError> {
  const name = input.name?.trim() ?? "";
  if (!name) {
    return DomainError.invalidInput("Name is required.", "person_name_required");
  }

  const row = await prisma.person.create({
    data: {
      householdId,
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
