export type ImportTargetId = "products" | "people";

/** Operator column map: CSV header name → Product field (or null = ignore). */
export interface ColumnMap {
  name: string | null;
  category: string | null;
  description: string | null;
}

export type ImportRowOutcome =
  | "created"
  | "updated"
  | "skipped"
  | "failed"
  | "unchanged";

export interface ImportSampleFailure {
  row: number;
  name?: string;
  message: string;
}

export interface ImportSummary {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  unchanged: number;
  /** Need-list marks that failed after a successful product upsert. */
  needFailed: number;
  samples: ImportSampleFailure[];
  dryRun: boolean;
  rowCount: number;
}

export interface MappedProductRow {
  row: number;
  name: string;
  category?: string;
  description?: string;
}

export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 5000;
export const IMPORT_MAX_SAMPLES = 20;

export function emptySummary(dryRun: boolean): ImportSummary {
  return {
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    unchanged: 0,
    needFailed: 0,
    samples: [],
    dryRun,
    rowCount: 0,
  };
}

export function pushSample(
  summary: ImportSummary,
  sample: ImportSampleFailure,
): void {
  if (summary.samples.length < IMPORT_MAX_SAMPLES) {
    summary.samples.push(sample);
  }
}
