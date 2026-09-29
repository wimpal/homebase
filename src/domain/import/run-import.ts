import { DomainError, isDomainError } from "@/domain/error";
import {
  loadPersonImportIndex,
  previewPersonImportRow,
  upsertPersonFromImport,
} from "@/domain/people";
import { markProductNeeded } from "@/domain/shopping/mark-needed";
import {
  loadProductNameMap,
  upsertProductFromImport,
} from "@/domain/shopping/product-catalog";
import { parseNotionCsv } from "./parse-csv";
import { getImportTarget } from "./targets/registry";
import {
  mapProductRows,
  resolveProductColumnMap,
} from "./targets/products";
import {
  mapPersonRows,
  resolvePeopleColumnMap,
} from "./targets/people";
import {
  pushSample,
  type ColumnMap,
  type ImportSummary,
  type ImportTargetId,
  type PeopleColumnMap,
} from "./types";

export interface RunImportInput {
  householdId: string;
  target: ImportTargetId | string;
  csvText: string;
  columnMap?: Partial<ColumnMap> | Partial<PeopleColumnMap> | null;
  markNeeded?: boolean;
}

function validateTarget(
  target: string,
): ImportTargetId | DomainError {
  const def = getImportTarget(target);
  if (!def) {
    return DomainError.invalidInput(
      `Unknown import target "${target}".`,
      "import_unknown_target",
    );
  }
  if (!def.enabled) {
    return DomainError.invalidInput(
      def.disabledReason ?? "This import target is not available yet.",
      "import_target_disabled",
    );
  }
  return def.id;
}

async function previewProducts(
  input: RunImportInput,
): Promise<ImportSummary | DomainError> {
  const csv = parseNotionCsv(input.csvText);
  if (isDomainError(csv)) return csv;

  const columnMap = resolveProductColumnMap(
    csv.headers,
    input.columnMap as Partial<ColumnMap> | null,
  );
  if (isDomainError(columnMap)) return columnMap;

  const { rows, summary } = mapProductRows(csv, columnMap);
  summary.dryRun = true;

  const nameMap = await loadProductNameMap(input.householdId);

  for (const row of rows) {
    const key = row.name.toLowerCase();
    const existing = nameMap.get(key);
    if (!existing) {
      summary.created += 1;
      nameMap.set(key, {
        id: "preview",
        name: row.name,
        category: row.category ?? null,
        description: row.description ?? null,
      });
      continue;
    }

    const wouldUpdate =
      Boolean(row.category && row.category !== existing.category) ||
      Boolean(row.description && row.description !== existing.description);

    if (wouldUpdate) {
      summary.updated += 1;
      nameMap.set(key, {
        ...existing,
        category: row.category ?? existing.category,
        description: row.description ?? existing.description,
      });
    } else {
      summary.unchanged += 1;
    }
  }

  return summary;
}

async function applyProducts(
  input: RunImportInput,
): Promise<ImportSummary | DomainError> {
  const csv = parseNotionCsv(input.csvText);
  if (isDomainError(csv)) return csv;

  const columnMap = resolveProductColumnMap(
    csv.headers,
    input.columnMap as Partial<ColumnMap> | null,
  );
  if (isDomainError(columnMap)) return columnMap;

  const { rows, summary } = mapProductRows(csv, columnMap);
  summary.dryRun = false;

  const nameMap = await loadProductNameMap(input.householdId);
  const markNeeded = Boolean(input.markNeeded);

  for (const row of rows) {
    try {
      const result = await upsertProductFromImport(
        input.householdId,
        {
          name: row.name,
          category: row.category,
          description: row.description,
        },
        nameMap,
      );

      if (isDomainError(result)) {
        summary.failed += 1;
        pushSample(summary, {
          row: row.row,
          name: row.name,
          message: result.message,
        });
        continue;
      }

      if (result.outcome === "created") summary.created += 1;
      else if (result.outcome === "updated") summary.updated += 1;
      else summary.unchanged += 1;

      if (markNeeded) {
        const needed = await markProductNeeded(input.householdId, {
          productId: result.id,
        });
        if (isDomainError(needed)) {
          summary.needFailed += 1;
          pushSample(summary, {
            row: row.row,
            name: row.name,
            message: `Product saved but mark-needed failed: ${needed.message}`,
          });
        }
      }
    } catch (err) {
      summary.failed += 1;
      pushSample(summary, {
        row: row.row,
        name: row.name,
        message: err instanceof Error ? err.message : "Unexpected write error.",
      });
    }
  }

  return summary;
}

async function previewPeople(
  input: RunImportInput,
): Promise<ImportSummary | DomainError> {
  const csv = parseNotionCsv(input.csvText);
  if (isDomainError(csv)) return csv;

  const columnMap = resolvePeopleColumnMap(
    csv.headers,
    input.columnMap as Partial<PeopleColumnMap> | null,
  );
  if (isDomainError(columnMap)) return columnMap;

  const { rows, summary } = mapPersonRows(csv, columnMap);
  summary.dryRun = true;

  const index = await loadPersonImportIndex(input.householdId);

  for (const row of rows) {
    const result = previewPersonImportRow(index, {
      name: row.name,
      familyName: row.familyName,
      birthday: row.birthday,
      phone: row.phone,
      email: row.email,
      addressLine: row.addressLine,
      city: row.city,
      notes: row.notes,
    });

    if (isDomainError(result)) {
      summary.failed += 1;
      pushSample(summary, {
        row: row.row,
        name: row.name,
        message: result.message,
      });
      continue;
    }

    if (result.outcome === "created") summary.created += 1;
    else if (result.outcome === "updated") summary.updated += 1;
    else summary.unchanged += 1;
  }

  return summary;
}

async function applyPeople(
  input: RunImportInput,
): Promise<ImportSummary | DomainError> {
  const csv = parseNotionCsv(input.csvText);
  if (isDomainError(csv)) return csv;

  const columnMap = resolvePeopleColumnMap(
    csv.headers,
    input.columnMap as Partial<PeopleColumnMap> | null,
  );
  if (isDomainError(columnMap)) return columnMap;

  const { rows, summary } = mapPersonRows(csv, columnMap);
  summary.dryRun = false;

  const index = await loadPersonImportIndex(input.householdId);

  for (const row of rows) {
    try {
      const result = await upsertPersonFromImport(
        input.householdId,
        {
          name: row.name,
          familyName: row.familyName,
          birthday: row.birthday,
          phone: row.phone,
          email: row.email,
          addressLine: row.addressLine,
          city: row.city,
          notes: row.notes,
        },
        index,
      );

      if (isDomainError(result)) {
        summary.failed += 1;
        pushSample(summary, {
          row: row.row,
          name: row.name,
          message: result.message,
        });
        continue;
      }

      if (result.outcome === "created") summary.created += 1;
      else if (result.outcome === "updated") summary.updated += 1;
      else summary.unchanged += 1;
    } catch (err) {
      summary.failed += 1;
      pushSample(summary, {
        row: row.row,
        name: row.name,
        message: err instanceof Error ? err.message : "Unexpected write error.",
      });
    }
  }

  return summary;
}

/**
 * Dry-run: parse + map against existing data; no writes.
 * Counts mirror apply (created / updated / unchanged / skipped / failed).
 */
export async function previewImport(
  input: RunImportInput,
): Promise<ImportSummary | DomainError> {
  const target = validateTarget(input.target);
  if (isDomainError(target)) return target;

  if (target === "products") return previewProducts(input);
  if (target === "people") return previewPeople(input);

  return DomainError.invalidInput(
    `Import target "${target}" is not implemented.`,
    "import_target_disabled",
  );
}

/** Apply: upsert products or people. Re-parses the same CSV text. */
export async function applyImport(
  input: RunImportInput,
): Promise<ImportSummary | DomainError> {
  const target = validateTarget(input.target);
  if (isDomainError(target)) return target;

  if (target === "products") return applyProducts(input);
  if (target === "people") return applyPeople(input);

  return DomainError.invalidInput(
    `Import target "${target}" is not implemented.`,
    "import_target_disabled",
  );
}

/** Headers-only helper for the UI before full preview. */
export function parseCsvHeaders(
  csvText: string,
): { headers: string[] } | DomainError {
  const csv = parseNotionCsv(csvText);
  if (isDomainError(csv)) return csv;
  return { headers: csv.headers };
}
