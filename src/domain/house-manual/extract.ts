import { DomainError } from "@/domain/error";

const ALLOWED_MIMES = new Set(["text/plain", "text/markdown"]);

export function isHouseManualMimeAllowed(mimeType: string): boolean {
  const base = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  return ALLOWED_MIMES.has(base);
}

/**
 * Extract plain text for indexing. v1: txt/md only (PDF deferred).
 */
export function extractHouseManualText(
  buffer: Buffer,
  mimeType: string,
): string | DomainError {
  if (!isHouseManualMimeAllowed(mimeType)) {
    return DomainError.invalidInput(
      "House manual v1 accepts .txt or .md only.",
      "house_manual_mime_unsupported",
    );
  }
  const text = buffer.toString("utf8");
  if (!text.trim()) {
    return DomainError.invalidInput(
      "Document has no extractable text.",
      "house_manual_empty_text",
    );
  }
  return text;
}
