/**
 * T-082 upload validation self-test (no DB).
 *   npx tsx scripts/project-uploads-selftest.ts
 */
import assert from "node:assert/strict";
import { contentTypeForUploadPath, uploadPathFromUrl } from "../src/core/uploads/service";

function testContentTypes() {
  assert.equal(contentTypeForUploadPath("/x/a.pdf"), "application/pdf");
  assert.equal(contentTypeForUploadPath("/x/a.txt"), "text/plain; charset=utf-8");
  assert.equal(contentTypeForUploadPath("/x/a.md"), "text/markdown; charset=utf-8");
  assert.equal(contentTypeForUploadPath("/x/a.png"), "image/png");
  assert.equal(contentTypeForUploadPath("/x/a.webp"), "image/webp");
  assert.equal(contentTypeForUploadPath("/x/a.bin"), "application/octet-stream");
}

function testUploadPathFromUrl() {
  assert.equal(
    uploadPathFromUrl("/api/uploads/hh/projects/files/abc.pdf")?.endsWith("abc.pdf"),
    true,
  );
  assert.equal(uploadPathFromUrl("/api/uploads/../etc/passwd"), null);
  assert.equal(uploadPathFromUrl("/other/path"), null);
}

testContentTypes();
testUploadPathFromUrl();
console.log("project-uploads-selftest: ok");
