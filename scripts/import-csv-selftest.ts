/**
 * Self-test for Notion CSV import pipe (no DB).
 * Usage: npx tsx scripts/import-csv-selftest.ts
 */
import { parseNotionCsv } from "../src/domain/import/parse-csv";
import {
  inferProductColumnMap,
  mapProductRows,
  resolveProductColumnMap,
} from "../src/domain/import/targets/products";
import { getImportTarget } from "../src/domain/import/targets/registry";
import { isDomainError } from "../src/domain/error";

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

// --- BOM + basic ---
{
  const r = parseNotionCsv("\uFEFFName,Category\nMilk,Dairy\n");
  assert(!isDomainError(r), "BOM CSV should parse");
  if (!isDomainError(r)) {
    assert(r.headers[0] === "Name", "header Name");
    assert(r.rows.length === 1, "one data row");
    assert(r.rows[0].Name === "Milk", "Milk cell");
    assert(r.rows[0].Category === "Dairy", "Dairy cell");
  }
}

// --- quoted comma + escaped quote ---
{
  const r = parseNotionCsv('Name,Notes\n"Bread, rye","He said ""hi"""\n');
  assert(!isDomainError(r), "quoted CSV should parse");
  if (!isDomainError(r)) {
    assert(r.rows[0].Name === "Bread, rye", "quoted comma in name");
    assert(r.rows[0].Notes === 'He said "hi"', "escaped quotes");
  }
}

// --- multiline cell ---
{
  const r = parseNotionCsv('Name,Notes\n"Soup","Line1\nLine2"\nEggs,\n');
  assert(!isDomainError(r), "multiline CSV should parse");
  if (!isDomainError(r)) {
    assert(r.rows[0].Notes.includes("Line1"), "multiline notes");
    assert(r.rows[0].Notes.includes("Line2"), "multiline notes line2");
    assert(r.rows[1].Name === "Eggs", "second row after multiline");
  }
}

// --- empty / no header ---
{
  const empty = parseNotionCsv("   ");
  assert(isDomainError(empty), "empty CSV fails");
  const noHeader = parseNotionCsv("\n\n");
  assert(isDomainError(noHeader) || (!isDomainError(noHeader) && noHeader.headers.every((h) => !h)), "blank header handled");
}

// --- aliases EN/NL ---
{
  const r = parseNotionCsv("Naam,Categorie,Notities\nMelk,Zuivel,Koelkast\n");
  assert(!isDomainError(r), "NL headers parse");
  if (!isDomainError(r)) {
    const map = inferProductColumnMap(r.headers);
    assert(map.name === "Naam", "Naam → name");
    assert(map.category === "Categorie", "Categorie → category");
    assert(map.description === "Notities", "Notities → description");
    const resolved = resolveProductColumnMap(r.headers, null);
    assert(!isDomainError(resolved), "resolve ok");
    if (!isDomainError(resolved)) {
      const { rows, summary } = mapProductRows(r, resolved);
      assert(rows.length === 1, "one mapped row");
      assert(rows[0].name === "Melk", "mapped name");
      assert(rows[0].category === "Zuivel", "mapped category");
      assert(summary.failed === 0, "no failures");
    }
  }
}

// --- duplicate names + empty name ---
{
  const r = parseNotionCsv("Name,Category\nMilk,Dairy\nmilk,Dairy\n,Other\nBread,Bakery\n");
  assert(!isDomainError(r), "dup CSV parse");
  if (!isDomainError(r)) {
    const map = resolveProductColumnMap(r.headers, null);
    assert(!isDomainError(map), "map ok");
    if (!isDomainError(map)) {
      const { rows, summary } = mapProductRows(r, map);
      assert(rows.length === 2, "Milk + Bread (dup milk skipped)");
      assert(summary.skipped === 1, "one skip for CI dup");
      assert(summary.failed === 1, "empty name failed");
      assert(rows[0].name === "Milk", "first Milk wins");
      assert(rows[1].name === "Bread", "Bread kept");
    }
  }
}

// --- blank optional fields not present on mapped row ---
{
  const r = parseNotionCsv("Name,Category,Notes\nTea,,\n");
  assert(!isDomainError(r), "blank optional parse");
  if (!isDomainError(r)) {
    const map = resolveProductColumnMap(r.headers, null);
    assert(!isDomainError(map), "map ok");
    if (!isDomainError(map)) {
      const { rows } = mapProductRows(r, map);
      assert(rows[0].category === undefined, "blank category omitted");
      assert(rows[0].description === undefined, "blank notes omitted");
    }
  }
}

// --- people target disabled ---
{
  const people = getImportTarget("people");
  assert(people !== null && people.enabled === false, "people disabled");
  const products = getImportTarget("products");
  assert(products !== null && products.enabled === true, "products enabled");
}

console.log("OK: import-csv-selftest passed");
