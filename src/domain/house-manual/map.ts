import type { HouseManualDocRecord } from "./types";

type HouseManualRow = {
  id: string;
  householdId: string;
  title: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  searchable: boolean;
  extractedText: string;
  uploadedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function toHouseManualDocRecord(
  row: HouseManualRow,
): HouseManualDocRecord {
  return {
    id: row.id,
    householdId: row.householdId,
    title: row.title,
    originalName: row.originalName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    url: row.url,
    searchable: row.searchable,
    extractedText: row.extractedText,
    uploadedByUserId: row.uploadedByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
