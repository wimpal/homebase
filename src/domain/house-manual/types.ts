export type HouseManualDocRecord = {
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

export type HouseManualSearchHit = {
  id: string;
  title: string;
  snippet: string;
};

export type HouseManualGetResult = {
  id: string;
  title: string;
  mime: string;
  body: string;
  truncated?: boolean;
};

export const HOUSE_MANUAL_BODY_MAX = 50_000;
export const HOUSE_MANUAL_SEARCH_MAX = 10;
export const HOUSE_MANUAL_QUERY_MAX = 200;
export const HOUSE_MANUAL_SNIPPET_CHARS = 200;
