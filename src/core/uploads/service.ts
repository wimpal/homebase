import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_UPLOADS = {
  "image/jpeg": { extension: ".jpg", signature: [0xff, 0xd8, 0xff] },
  "image/png": { extension: ".png", signature: [0x89, 0x50, 0x4e, 0x47] },
  "image/gif": { extension: ".gif", signature: [0x47, 0x49, 0x46, 0x38] },
  "image/webp": { extension: ".webp", signature: [0x52, 0x49, 0x46, 0x46] },
} as const;

export async function saveUpload(
  file: File,
  { householdId, subdir }: { householdId: string; subdir: "plants" | "projects" }
): Promise<string> {
  if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) {
    throw new Error("Upload must be between 1 byte and 10 MB");
  }
  const allowed = ALLOWED_UPLOADS[file.type as keyof typeof ALLOWED_UPLOADS];
  if (!allowed) throw new Error("Unsupported upload type");

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  if (!allowed.signature.every((byte, index) => buffer[index] === byte)) {
    throw new Error("Upload content does not match its declared type");
  }

  const filename = `${randomUUID()}${allowed.extension}`;
  const dir = path.resolve(UPLOAD_DIR, householdId, subdir);
  const root = path.resolve(UPLOAD_DIR);
  if (!dir.startsWith(`${root}${path.sep}`)) throw new Error("Invalid upload path");
  await mkdir(dir, { recursive: true });
  const filepath = path.resolve(dir, filename);
  await writeFile(filepath, buffer);
  return `/api/uploads/${householdId}/${subdir}/${filename}`;
}
