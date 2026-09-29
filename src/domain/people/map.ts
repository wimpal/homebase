import type { Person } from "@prisma/client";
import type { PersonRecord } from "./types";

export function toPersonRecord(row: Person): PersonRecord {
  return {
    id: row.id,
    householdId: row.householdId,
    name: row.name,
    familyName: row.familyName,
    birthday: row.birthday,
    phone: row.phone,
    email: row.email,
    addressLine: row.addressLine,
    city: row.city,
    notes: row.notes,
    photoUrl: row.photoUrl,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Display label: "Name" or "Name FamilyName". */
export function formatPersonDisplayName(
  name: string,
  familyName?: string | null,
): string {
  const given = name.trim();
  const family = familyName?.trim() ?? "";
  return family ? `${given} ${family}` : given;
}
