"use server";

import { requireHousehold, requireMutationAccess } from "@/core/auth/session";
import {
  birthdayToInputValue,
  formatBirthdayDdMmYyyy,
  parseBirthdayInput,
} from "@/domain/accounts/birthday";
import {
  createPerson,
  deletePerson,
  listPeople,
  updatePerson,
  type PersonRecord,
} from "@/domain/people";
import { isDomainError } from "@/domain/error";
import {
  failResult,
  fromDomainError,
  okResult,
  type ActionResult,
} from "@/lib/action-result";
import { ModuleId } from "@prisma/client";
import { revalidatePath } from "next/cache";

export type PersonListItem = Omit<PersonRecord, "birthday"> & {
  birthday: string | null;
  birthdayInput: string;
  displayName: string;
};

function toListItem(row: PersonRecord): PersonListItem {
  const family = row.familyName?.trim() ?? "";
  return {
    ...row,
    birthday: formatBirthdayDdMmYyyy(row.birthday),
    birthdayInput: birthdayToInputValue(row.birthday),
    displayName: family ? `${row.name} ${family}` : row.name,
  };
}

export async function getPeople(): Promise<PersonListItem[]> {
  const { householdId } = await requireHousehold();
  const rows = await listPeople(householdId);
  return rows.map(toListItem);
}

function parseWriteFields(formData: FormData): {
  name: string;
  familyName: string | null;
  birthday: Date | null | "invalid";
  phone: string | null;
  email: string | null;
  addressLine: string | null;
  city: string | null;
  notes: string | null;
} {
  const blank = (key: string) => {
    const v = formData.get(key);
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t === "" ? null : t;
  };

  return {
    name: String(formData.get("name") ?? ""),
    familyName: blank("familyName"),
    birthday: parseBirthdayInput(blank("birthday")),
    phone: blank("phone"),
    email: blank("email"),
    addressLine: blank("addressLine"),
    city: blank("city"),
    notes: blank("notes"),
  };
}

export async function createPersonAction(
  formData: FormData,
): Promise<ActionResult> {
  const { householdId } = await requireMutationAccess(ModuleId.PEOPLE);
  const fields = parseWriteFields(formData);
  if (fields.birthday === "invalid") {
    return failResult("Invalid birthday.", "invalid_birthday");
  }

  const result = await createPerson(householdId, {
    name: fields.name,
    familyName: fields.familyName,
    birthday: fields.birthday,
    phone: fields.phone,
    email: fields.email,
    addressLine: fields.addressLine,
    city: fields.city,
    notes: fields.notes,
  });
  if (isDomainError(result)) return fromDomainError(result);
  revalidatePath("/people");
  return okResult();
}

export async function updatePersonAction(
  formData: FormData,
): Promise<ActionResult> {
  const { householdId } = await requireMutationAccess(ModuleId.PEOPLE);
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return failResult("Person id is required.", "person_id_required");

  const fields = parseWriteFields(formData);
  if (fields.birthday === "invalid") {
    return failResult("Invalid birthday.", "invalid_birthday");
  }

  const result = await updatePerson(householdId, id, {
    name: fields.name,
    familyName: fields.familyName,
    birthday: fields.birthday,
    phone: fields.phone,
    email: fields.email,
    addressLine: fields.addressLine,
    city: fields.city,
    notes: fields.notes,
  });
  if (isDomainError(result)) return fromDomainError(result);
  revalidatePath("/people");
  return okResult();
}

export async function deletePersonAction(
  formData: FormData,
): Promise<ActionResult> {
  const { householdId } = await requireMutationAccess(ModuleId.PEOPLE);
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return failResult("Person id is required.", "person_id_required");

  const result = await deletePerson(householdId, id);
  if (isDomainError(result)) return fromDomainError(result);
  revalidatePath("/people");
  return okResult();
}
