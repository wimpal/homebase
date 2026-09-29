import { prisma } from "@/core/db";
import { DomainError } from "@/domain/error";
import type {
  ImportPersonFields,
  ImportPersonResult,
  PersonImportIndexRow,
} from "./types";

function optionalTrim(value: string | null | undefined): string | null {
  if (value == null) return null;
  const t = value.trim();
  return t === "" ? null : t;
}

function emailKey(email: string | null | undefined): string | null {
  const t = optionalTrim(email);
  return t ? t.toLowerCase() : null;
}

function namePairKey(
  name: string,
  familyName: string | null | undefined,
): string | null {
  const given = name.trim().toLowerCase();
  const family = familyName?.trim().toLowerCase() ?? "";
  if (!given || !family) return null;
  return `${given}\0${family}`;
}

function sameUtcDate(a: Date | null, b: Date | null): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

export interface PersonImportIndex {
  byEmail: Map<string, PersonImportIndexRow[]>;
  byNamePair: Map<string, PersonImportIndexRow[]>;
}

/** Load household people into match indexes for import preview/apply. */
export async function loadPersonImportIndex(
  householdId: string,
): Promise<PersonImportIndex> {
  const rows = await prisma.person.findMany({
    where: { householdId },
    select: {
      id: true,
      name: true,
      familyName: true,
      birthday: true,
      phone: true,
      email: true,
      addressLine: true,
      city: true,
      notes: true,
    },
  });

  const byEmail = new Map<string, PersonImportIndexRow[]>();
  const byNamePair = new Map<string, PersonImportIndexRow[]>();

  for (const row of rows) {
    const ek = emailKey(row.email);
    if (ek) {
      const list = byEmail.get(ek) ?? [];
      list.push(row);
      byEmail.set(ek, list);
    }
    const nk = namePairKey(row.name, row.familyName);
    if (nk) {
      const list = byNamePair.get(nk) ?? [];
      list.push(row);
      byNamePair.set(nk, list);
    }
  }

  return { byEmail, byNamePair };
}

function findMatch(
  index: PersonImportIndex,
  fields: ImportPersonFields,
):
  | { kind: "none" }
  | { kind: "one"; row: PersonImportIndexRow }
  | { kind: "ambiguous"; message: string }
  | { kind: "create_only" } {
  const ek = emailKey(fields.email);
  if (ek) {
    const hits = index.byEmail.get(ek) ?? [];
    if (hits.length > 1) {
      return {
        kind: "ambiguous",
        message: `Multiple contacts share email "${fields.email}".`,
      };
    }
    if (hits.length === 1) return { kind: "one", row: hits[0] };
    // Email present but no match — fall through to name-pair / create
  }

  const nk = namePairKey(fields.name, fields.familyName);
  if (nk) {
    const hits = index.byNamePair.get(nk) ?? [];
    if (hits.length > 1) {
      return {
        kind: "ambiguous",
        message: `Multiple contacts named "${fields.name} ${fields.familyName}".`,
      };
    }
    if (hits.length === 1) return { kind: "one", row: hits[0] };
    return { kind: "none" };
  }

  // Given name only, no email → never auto-merge
  return { kind: "create_only" };
}

function wouldUpdate(
  existing: PersonImportIndexRow,
  fields: ImportPersonFields,
): boolean {
  const familyName = optionalTrim(fields.familyName);
  const phone = optionalTrim(fields.phone);
  const email = optionalTrim(fields.email);
  const addressLine = optionalTrim(fields.addressLine);
  const city = optionalTrim(fields.city);
  const notes = optionalTrim(fields.notes);
  const birthday =
    fields.birthday === undefined ? existing.birthday : fields.birthday;

  return (
    fields.name.trim() !== existing.name ||
    familyName !== existing.familyName ||
    !sameUtcDate(birthday, existing.birthday) ||
    phone !== existing.phone ||
    email !== existing.email ||
    addressLine !== existing.addressLine ||
    city !== existing.city ||
    notes !== existing.notes
  );
}

function applyIndexMutation(
  index: PersonImportIndex,
  previous: PersonImportIndexRow | null,
  next: PersonImportIndexRow,
): void {
  if (previous) {
    const oldEk = emailKey(previous.email);
    if (oldEk) {
      const list = (index.byEmail.get(oldEk) ?? []).filter(
        (r) => r.id !== previous.id,
      );
      if (list.length === 0) index.byEmail.delete(oldEk);
      else index.byEmail.set(oldEk, list);
    }
    const oldNk = namePairKey(previous.name, previous.familyName);
    if (oldNk) {
      const list = (index.byNamePair.get(oldNk) ?? []).filter(
        (r) => r.id !== previous.id,
      );
      if (list.length === 0) index.byNamePair.delete(oldNk);
      else index.byNamePair.set(oldNk, list);
    }
  }

  const ek = emailKey(next.email);
  if (ek) {
    const list = index.byEmail.get(ek) ?? [];
    list.push(next);
    index.byEmail.set(ek, list);
  }
  const nk = namePairKey(next.name, next.familyName);
  if (nk) {
    const list = index.byNamePair.get(nk) ?? [];
    list.push(next);
    index.byNamePair.set(nk, list);
  }
}

/**
 * Preview match outcome without writing. Mutates index so later rows stay accurate.
 */
export function previewPersonImportRow(
  index: PersonImportIndex,
  fields: ImportPersonFields,
): ImportPersonResult | DomainError {
  const name = fields.name.trim();
  if (!name) {
    return DomainError.invalidInput("Name is required.", "person_name_required");
  }

  const match = findMatch(index, fields);
  if (match.kind === "ambiguous") {
    return DomainError.conflict(match.message, "person_import_ambiguous");
  }

  if (match.kind === "one") {
    if (!wouldUpdate(match.row, fields)) {
      return { id: match.row.id, name, outcome: "unchanged" };
    }
    const next: PersonImportIndexRow = {
      ...match.row,
      name,
      familyName: optionalTrim(fields.familyName),
      birthday:
        fields.birthday === undefined ? match.row.birthday : fields.birthday,
      phone: optionalTrim(fields.phone),
      email: optionalTrim(fields.email),
      addressLine: optionalTrim(fields.addressLine),
      city: optionalTrim(fields.city),
      notes: optionalTrim(fields.notes),
    };
    applyIndexMutation(index, match.row, next);
    return { id: match.row.id, name, outcome: "updated" };
  }

  // none or create_only → create
  const created: PersonImportIndexRow = {
    id: `preview-${index.byEmail.size}-${index.byNamePair.size}-${name}`,
    name,
    familyName: optionalTrim(fields.familyName),
    birthday: fields.birthday ?? null,
    phone: optionalTrim(fields.phone),
    email: optionalTrim(fields.email),
    addressLine: optionalTrim(fields.addressLine),
    city: optionalTrim(fields.city),
    notes: optionalTrim(fields.notes),
  };
  applyIndexMutation(index, null, created);
  return { id: created.id, name, outcome: "created" };
}

/**
 * Create or update a Person for Notion import.
 * Blank optional cells clear existing values on update (full-replacement).
 * Mutates `index` so subsequent rows in the same run stay consistent.
 */
export async function upsertPersonFromImport(
  householdId: string,
  fields: ImportPersonFields,
  index: PersonImportIndex,
): Promise<ImportPersonResult | DomainError> {
  const name = fields.name.trim();
  if (!name) {
    return DomainError.invalidInput("Name is required.", "person_name_required");
  }

  const match = findMatch(index, fields);
  if (match.kind === "ambiguous") {
    return DomainError.conflict(match.message, "person_import_ambiguous");
  }

  if (match.kind === "one") {
    if (!wouldUpdate(match.row, fields)) {
      return { id: match.row.id, name, outcome: "unchanged" };
    }

    const data = {
      name,
      familyName: optionalTrim(fields.familyName),
      birthday:
        fields.birthday === undefined ? match.row.birthday : fields.birthday,
      phone: optionalTrim(fields.phone),
      email: optionalTrim(fields.email),
      addressLine: optionalTrim(fields.addressLine),
      city: optionalTrim(fields.city),
      notes: optionalTrim(fields.notes),
    };

    const updated = await prisma.person.update({
      where: { id: match.row.id },
      data,
      select: {
        id: true,
        name: true,
        familyName: true,
        birthday: true,
        phone: true,
        email: true,
        addressLine: true,
        city: true,
        notes: true,
      },
    });

    applyIndexMutation(index, match.row, updated);
    return { id: updated.id, name: updated.name, outcome: "updated" };
  }

  const created = await prisma.person.create({
    data: {
      householdId,
      name,
      familyName: optionalTrim(fields.familyName),
      birthday: fields.birthday ?? null,
      phone: optionalTrim(fields.phone),
      email: optionalTrim(fields.email),
      addressLine: optionalTrim(fields.addressLine),
      city: optionalTrim(fields.city),
      notes: optionalTrim(fields.notes),
    },
    select: {
      id: true,
      name: true,
      familyName: true,
      birthday: true,
      phone: true,
      email: true,
      addressLine: true,
      city: true,
      notes: true,
    },
  });

  applyIndexMutation(index, null, created);
  return { id: created.id, name: created.name, outcome: "created" };
}
