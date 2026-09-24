import { DomainError } from "@/domain/error";
import type { ParsedCsv } from "../parse-csv";
import {
  emptySummary,
  pushSample,
  type ColumnMap,
  type ImportSummary,
  type MappedProductRow,
} from "../types";

const NAME_ALIASES = ["name", "title", "naam", "product", "product name"];
const CATEGORY_ALIASES = ["category", "categorie", "cat"];
const DESCRIPTION_ALIASES = [
  "notes",
  "description",
  "notities",
  "omschrijving",
  "note",
];

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase();
}

/** Infer a ColumnMap from CSV headers using EN/NL aliases. */
export function inferProductColumnMap(headers: string[]): ColumnMap {
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
    category: pick(CATEGORY_ALIASES),
    description: pick(DESCRIPTION_ALIASES),
  };
}

export function resolveProductColumnMap(
  headers: string[],
  override?: Partial<ColumnMap> | null,
): ColumnMap | DomainError {
  const inferred = inferProductColumnMap(headers);
  const map: ColumnMap = {
    name: override?.name !== undefined ? override.name : inferred.name,
    category:
      override?.category !== undefined ? override.category : inferred.category,
    description:
      override?.description !== undefined
        ? override.description
        : inferred.description,
  };

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

  for (const key of ["category", "description"] as const) {
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

/**
 * Map parsed CSV rows to product payloads.
 * Duplicate CI names within the file: first wins; later rows recorded as skipped.
 * Empty name → failed.
 */
export function mapProductRows(
  csv: ParsedCsv,
  columnMap: ColumnMap,
): { rows: MappedProductRow[]; summary: ImportSummary } {
  const summary = emptySummary(true);
  summary.rowCount = csv.rows.length;
  const rows: MappedProductRow[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < csv.rows.length; i++) {
    const raw = csv.rows[i];
    const rowNum = i + 2; // 1-based data row (header is line 1)

    const nameCell = columnMap.name
      ? (raw[columnMap.name] ?? "").trim()
      : "";
    if (!nameCell) {
      summary.failed += 1;
      pushSample(summary, {
        row: rowNum,
        message: "Name is required.",
      });
      continue;
    }

    const key = nameCell.toLowerCase();
    if (seen.has(key)) {
      summary.skipped += 1;
      pushSample(summary, {
        row: rowNum,
        name: nameCell,
        message: "Duplicate name in file (first row wins).",
      });
      continue;
    }
    seen.add(key);

    const categoryRaw = columnMap.category
      ? (raw[columnMap.category] ?? "").trim()
      : "";
    const descriptionRaw = columnMap.description
      ? (raw[columnMap.description] ?? "").trim()
      : "";

    rows.push({
      row: rowNum,
      name: nameCell,
      ...(categoryRaw ? { category: categoryRaw } : {}),
      ...(descriptionRaw ? { description: descriptionRaw } : {}),
    });
  }

  return { rows, summary };
}
