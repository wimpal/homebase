import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export type UploadSubdir =
  | "plants"
  | "projects"
  | "projects/files"
  | "projects/vision";

type ImageRule = {
  extension: string;
  contentType: string;
  validate: (buffer: Buffer) => boolean;
};

const IMAGE_UPLOADS: Record<string, ImageRule> = {
  "image/jpeg": {
    extension: ".jpg",
    contentType: "image/jpeg",
    validate: (buffer) =>
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff,
  },
  "image/png": {
    extension: ".png",
    contentType: "image/png",
    validate: (buffer) =>
      buffer.length >= 4 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47,
  },
  "image/gif": {
    extension: ".gif",
    contentType: "image/gif",
    validate: (buffer) =>
      buffer.length >= 4 &&
      buffer[0] === 0x47 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x38,
  },
  "image/webp": {
    extension: ".webp",
    contentType: "image/webp",
    validate: (buffer) =>
      buffer.length >= 12 &&
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50,
  },
};

function isMostlyText(buffer: Buffer): boolean {
  if (buffer.length === 0) return false;
  let suspicious = 0;
  const sample = Math.min(buffer.length, 4096);
  for (let i = 0; i < sample; i++) {
    const byte = buffer[i];
    if (byte === 0) return false;
    if (byte < 0x09 || (byte > 0x0d && byte < 0x20 && byte !== 0x1b)) {
      suspicious += 1;
    }
  }
  return suspicious / sample < 0.05;
}

function resolveUploadRule(
  mimeType: string,
  buffer: Buffer,
  originalName: string,
): { extension: string; contentType: string } {
  const image = IMAGE_UPLOADS[mimeType];
  if (image) {
    if (!image.validate(buffer)) {
      throw new Error("Upload content does not match its declared type");
    }
    return { extension: image.extension, contentType: image.contentType };
  }

  if (mimeType === "application/pdf") {
    const header = buffer.subarray(0, 5).toString("ascii");
    if (!header.startsWith("%PDF")) {
      throw new Error("Upload content does not match its declared type");
    }
    return { extension: ".pdf", contentType: "application/pdf" };
  }

  const lowerName = originalName.toLowerCase();
  if (mimeType === "text/plain" || mimeType === "text/markdown") {
    if (!isMostlyText(buffer)) {
      throw new Error("Upload content does not match its declared type");
    }
    if (mimeType === "text/markdown" || lowerName.endsWith(".md")) {
      return { extension: ".md", contentType: "text/markdown; charset=utf-8" };
    }
    return { extension: ".txt", contentType: "text/plain; charset=utf-8" };
  }

  throw new Error("Unsupported upload type");
}

export function contentTypeForUploadPath(filepath: string): string {
  const ext = path.extname(filepath).toLowerCase();
  switch (ext) {
    case ".png":
      return "image/png";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".pdf":
      return "application/pdf";
    case ".txt":
      return "text/plain; charset=utf-8";
    case ".md":
      return "text/markdown; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

export function uploadPathFromUrl(url: string): string | null {
  const prefix = "/api/uploads/";
  if (!url.startsWith(prefix)) return null;
  const relative = url.slice(prefix.length);
  const segments = relative.split("/").filter(Boolean);
  if (segments.length < 3) return null;
  if (segments.some((s) => s === "." || s === ".." || s.includes("\0"))) return null;
  const root = path.resolve(UPLOAD_DIR);
  const filepath = path.resolve(root, ...segments);
  if (!filepath.startsWith(`${root}${path.sep}`)) return null;
  return filepath;
}

export async function deleteUploadByUrl(url: string): Promise<void> {
  const filepath = uploadPathFromUrl(url);
  if (!filepath) return;
  try {
    await unlink(filepath);
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? (err as { code?: string }).code : undefined;
    if (code !== "ENOENT") {
      console.warn(`WARN: cleanup delete failed — ${filepath}`, err);
    }
  }
}

export async function deleteUploadsByUrls(urls: Array<string | null | undefined>): Promise<void> {
  const unique = [...new Set(urls.filter((u): u is string => Boolean(u)))];
  await Promise.all(unique.map((url) => deleteUploadByUrl(url)));
}

export async function saveUpload(
  file: File,
  { householdId, subdir }: { householdId: string; subdir: UploadSubdir },
): Promise<{ url: string; mimeType: string; sizeBytes: number; originalName: string }> {
  if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) {
    throw new Error("Upload must be between 1 byte and 10 MB");
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const originalName = file.name || "upload";
  const rule = resolveUploadRule(file.type, buffer, originalName);

  const filename = `${randomUUID()}${rule.extension}`;
  const dir = path.resolve(UPLOAD_DIR, householdId, ...subdir.split("/"));
  const root = path.resolve(UPLOAD_DIR);
  if (!dir.startsWith(`${root}${path.sep}`)) throw new Error("Invalid upload path");
  await mkdir(dir, { recursive: true });
  const filepath = path.resolve(dir, filename);
  await writeFile(filepath, buffer);
  const urlPath = `/api/uploads/${householdId}/${subdir.split("/").join("/")}/${filename}`;
  return {
    url: urlPath,
    mimeType: rule.contentType.split(";")[0],
    sizeBytes: file.size,
    originalName,
  };
}
