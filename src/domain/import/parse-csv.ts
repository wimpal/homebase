import { DomainError } from "@/domain/error";
import { IMPORT_MAX_BYTES, IMPORT_MAX_ROWS } from "./types";

export interface ParsedCsv {
  headers: string[];
  /** Data rows as objects keyed by header (duplicate headers: last wins). */
  rows: Record<string, string>[];
}

/**
 * RFC4180-ish CSV parser for Notion database exports.
 * Comma delimiter; quoted fields; "" escapes; multiline cells; UTF-8 BOM stripped.
 */
export function parseNotionCsv(text: string): ParsedCsv | DomainError {
  if (text.length > IMPORT_MAX_BYTES) {
    return DomainError.invalidInput(
      `CSV exceeds ${IMPORT_MAX_BYTES} bytes.`,
      "import_file_too_large",
    );
  }

  const normalized = text.replace(/^\uFEFF/, "");
  if (!normalized.trim()) {
    return DomainError.invalidInput("CSV is empty.", "import_csv_empty");
  }

  const records = parseRecords(normalized);
  if (records.length === 0) {
    return DomainError.invalidInput("CSV has no rows.", "import_csv_empty");
  }

  const headers = records[0].map((h) => h.trim());
  if (headers.length === 0 || headers.every((h) => !h)) {
    return DomainError.invalidInput(
      "CSV header row is missing.",
      "import_csv_no_header",
    );
  }

  const dataRecords = records.slice(1);
  if (dataRecords.length > IMPORT_MAX_ROWS) {
    return DomainError.invalidInput(
      `CSV has more than ${IMPORT_MAX_ROWS} data rows.`,
      "import_too_many_rows",
    );
  }

  const rows: Record<string, string>[] = [];
  for (const cells of dataRecords) {
    // Skip fully empty trailing rows Notion sometimes emits
    if (cells.every((c) => !c.trim())) continue;
    const row: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      const key = headers[i];
      if (!key) continue;
      row[key] = cells[i] ?? "";
    }
    rows.push(row);
  }

  return { headers, rows };
}

function parseRecords(text: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let i = 0;
  let inQuotes = false;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }

    if (ch === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }

    if (ch === "\r") {
      row.push(field);
      field = "";
      records.push(row);
      row = [];
      i += 1;
      if (text[i] === "\n") i += 1;
      continue;
    }

    if (ch === "\n") {
      row.push(field);
      field = "";
      records.push(row);
      row = [];
      i += 1;
      continue;
    }

    field += ch;
    i += 1;
  }

  // Last field / row (file may omit trailing newline)
  if (field.length > 0 || row.length > 0 || inQuotes) {
    row.push(field);
    records.push(row);
  }

  return records;
}
