import { DomainError, isDomainError } from "@/domain/error";
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
  emptySummary,
  pushSample,
  type ColumnMap,
  type ImportSummary,
  type ImportTargetId,
} from "./types";

export interface RunImportInput {
  householdId: string;
  target: ImportTargetId | string;
  csvText: string;
  columnMap?: Partial<ColumnMap> | null;
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

/**
 * Dry-run: parse + map against existing catalog; no writes.
 * Counts mirror apply (created / updated / unchanged / skipped / failed).
 */
export async function previewImport(
  input: RunImportInput,
): Promise<ImportSummary | DomainError> {
  const target = validateTarget(input.target);
  if (isDomainError(target)) return target;
  if (target !== "products") {
    return DomainError.invalidInput(
      "Only the products target is implemented.",
      "import_target_disabled",
    );
  }

  const csv = parseNotionCsv(input.csvText);
  if (isDomainError(csv)) return csv;

  const columnMap = resolveProductColumnMap(csv.headers, input.columnMap);
  if (isDomainError(columnMap)) return columnMap;

  const { rows, summary } = mapProductRows(csv, columnMap);
  summary.dryRun = true;

  const nameMap = await loadProductNameMap(input.householdId);

  for (const row of rows) {
    const key = row.name.toLowerCase();
    const existing = nameMap.get(key);
    if (!existing) {
      summary.created += 1;
      // Simulate create so later duplicate detections stay accurate
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

/** Apply: upsert products; optionally mark needed. Re-parses the same CSV text. */
export async function applyImport(
  input: RunImportInput,
): Promise<ImportSummary | DomainError> {
  const target = validateTarget(input.target);
  if (isDomainError(target)) return target;
  if (target !== "products") {
    return DomainError.invalidInput(
      "Only the products target is implemented.",
      "import_target_disabled",
    );
  }

  const csv = parseNotionCsv(input.csvText);
  if (isDomainError(csv)) return csv;

  const columnMap = resolveProductColumnMap(csv.headers, input.columnMap);
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

/** Headers-only helper for the UI before full preview. */
export function parseCsvHeaders(
  csvText: string,
): { headers: string[] } | DomainError {
  const csv = parseNotionCsv(csvText);
  if (isDomainError(csv)) return csv;
  return { headers: csv.headers };
}

export { emptySummary };
