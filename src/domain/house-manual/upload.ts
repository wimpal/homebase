import { prisma } from "@/core/db";
import { DomainError } from "@/domain/error";
import { deleteUploadByUrl } from "@/core/uploads/service";
import { extractHouseManualText, isHouseManualMimeAllowed } from "./extract";
import { toHouseManualDocRecord } from "./map";
import type { HouseManualDocRecord } from "./types";

export type UploadHouseManualInput = {
  title: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  buffer: Buffer;
  uploadedByUserId: string | null;
};

export async function uploadHouseManualDoc(
  householdId: string,
  input: UploadHouseManualInput,
): Promise<HouseManualDocRecord | DomainError> {
  const title = input.title.trim();
  if (!title) {
    return DomainError.invalidInput(
      "Title is required.",
      "house_manual_title_required",
    );
  }

  if (!isHouseManualMimeAllowed(input.mimeType)) {
    return DomainError.invalidInput(
      "House manual v1 accepts .txt or .md only.",
      "house_manual_mime_unsupported",
    );
  }

  const extracted = extractHouseManualText(input.buffer, input.mimeType);
  if (extracted instanceof DomainError) {
    await deleteUploadByUrl(input.url);
    return extracted;
  }

  try {
    const row = await prisma.houseManualDocument.create({
      data: {
        householdId,
        title,
        originalName: input.originalName,
        mimeType: input.mimeType.split(";")[0]?.trim() || input.mimeType,
        sizeBytes: input.sizeBytes,
        url: input.url,
        searchable: false,
        extractedText: extracted,
        uploadedByUserId: input.uploadedByUserId,
      },
    });
    return toHouseManualDocRecord(row);
  } catch (err) {
    await deleteUploadByUrl(input.url);
    throw err;
  }
}
