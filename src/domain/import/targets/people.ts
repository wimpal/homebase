import { DomainError } from "@/domain/error";
import type { ParsedCsv } from "../parse-csv";
import { parseImportBirthday } from "../parse-birthday";
import {
  emptySummary,
  pushSample,
  type ImportSummary,
  type MappedPersonRow,
  type PeopleColumnMap,
} from "../types";

const NAME_ALIASES = ["name", "naam", "first name", "voornaam", "given name"];
const FAMILY_ALIASES = [
  "achternaam",
  "family name",
  "last name",
  "surname",
  "lastname",
];
const BIRTHDAY_ALIASES = [
  "geboortedatum",
  "birthday",
  "birth date",
  "birthdate",
  "date of birth",
  "dob",
];
const PHONE_ALIASES = ["telefoon", "phone", "tel", "mobile", "mobiel"];
const EMAIL_ALIASES = ["e-mail", "email", "mail"];
const ADDRESS_ALIASES = ["adres", "address", "street", "straat"];
const CITY_ALIASES = ["plaats", "city", "plaatsnaam", "woonplaats"];
const NOTES_ALIASES = ["notes", "notities", "note", "omschrijving"];

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase();
}

/** Infer a PeopleColumnMap from CSV headers using EN/NL aliases. */
export function inferPeopleColumnMap(headers: string[]): PeopleColumnMap {
  const byNorm = new Map(headers.map((h) => [normalizeHeader(h), h]));

  function pick(aliases: string[]): string | null {
    for (const a of aliases) {
      const hit = byNorm.get(a);
      if (hit) return hit;
    }
    return null;
  }

  return {
    name: pick(NAME_ALIASES),
    familyName: pick(FAMILY_ALIASES),
    birthday: pick(BIRTHDAY_ALIASES),
    phone: pick(PHONE_ALIASES),
    email: pick(EMAIL_ALIASES),
    addressLine: pick(ADDRESS_ALIASES),
    city: pick(CITY_ALIASES),
    notes: pick(NOTES_ALIASES),
  };
}

export function resolvePeopleColumnMap(
  headers: string[],
  override?: Partial<PeopleColumnMap> | null,
): PeopleColumnMap | DomainError {
  const inferred = inferPeopleColumnMap(headers);
  const keys = [
    "name",
    "familyName",
    "birthday",
    "phone",
    "email",
    "addressLine",
    "city",
    "notes",
  ] as const;

  const map: PeopleColumnMap = { ...inferred };
  for (const key of keys) {
    if (override && override[key] !== undefined) {
      map[key] = override[key] ?? null;
    }
  }

  if (!map.name) {
    return DomainError.invalidInput(
      "Name column is required. Map a CSV header to name.",
      "import_name_column_required",
    );
  }

  if (!headers.includes(map.name)) {
    return DomainError.invalidInput(
      `Name column "${map.name}" is not in the CSV header.`,
      "import_invalid_column",
    );
  }

  for (const key of keys) {
    if (key === "name") continue;
    const h = map[key];
    if (h && !headers.includes(h)) {
      return DomainError.invalidInput(
        `Column "${h}" is not in the CSV header.`,
        "import_invalid_column",
      );
    }
  }

  return map;
}

function cell(
  raw: Record<string, string>,
  header: string | null,
): string {
  if (!header) return "";
  return (raw[header] ?? "").trim();
}

/**
 * Map parsed CSV rows to person payloads.
 * Empty name → failed. Invalid birthday → failed.
 * Duplicate identity within the file is left to upsert matching.
 */
export function mapPersonRows(
  csv: ParsedCsv,
  columnMap: PeopleColumnMap,
): { rows: MappedPersonRow[]; summary: ImportSummary } {
  const summary = emptySummary(true);
  summary.rowCount = csv.rows.length;
  const rows: MappedPersonRow[] = [];

  for (let i = 0; i < csv.rows.length; i++) {
    const raw = csv.rows[i];
    const rowNum = i + 2; // 1-based data row (header is line 1)

    const name = cell(raw, columnMap.name);
    if (!name) {
      summary.failed += 1;
      pushSample(summary, {
        row: rowNum,
        message: "Name is required.",
      });
      continue;
    }

    const birthdayRaw = cell(raw, columnMap.birthday);
    const birthday = parseImportBirthday(birthdayRaw);
    if (birthday === "invalid") {
      summary.failed += 1;
      pushSample(summary, {
        row: rowNum,
        name,
        message: `Invalid birthday "${birthdayRaw}".`,
      });
      continue;
    }

    const familyName = cell(raw, columnMap.familyName) || undefined;
    const phone = cell(raw, columnMap.phone) || undefined;
    const email = cell(raw, columnMap.email) || undefined;
    const addressLine = cell(raw, columnMap.addressLine) || undefined;
    const city = cell(raw, columnMap.city) || undefined;
    const notes = cell(raw, columnMap.notes) || undefined;

    rows.push({
      row: rowNum,
      name,
      familyName,
      birthday,
      phone,
      email,
      addressLine,
      city,
      notes,
    });
  }

  return { rows, summary };
}

export {
  NAME_ALIASES,
  FAMILY_ALIASES,
  BIRTHDAY_ALIASES,
  PHONE_ALIASES,
  EMAIL_ALIASES,
  ADDRESS_ALIASES,
  CITY_ALIASES,
};
