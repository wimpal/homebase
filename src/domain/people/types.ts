export interface PersonRecord {
  id: string;
  householdId: string;
  name: string;
  familyName: string | null;
  birthday: Date | null;
  phone: string | null;
  email: string | null;
  addressLine: string | null;
  city: string | null;
  notes: string | null;
  photoUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PersonWriteInput {
  name: string;
  familyName?: string | null;
  birthday?: Date | null;
  phone?: string | null;
  email?: string | null;
  addressLine?: string | null;
  city?: string | null;
  notes?: string | null;
}

export type ImportPersonOutcome = "created" | "updated" | "unchanged";

export interface ImportPersonFields {
  name: string;
  familyName?: string;
  birthday?: Date | null;
  phone?: string;
  email?: string;
  addressLine?: string;
  city?: string;
  notes?: string;
}

export interface ImportPersonResult {
  id: string;
  name: string;
  outcome: ImportPersonOutcome;
}

/** In-memory row used while matching during import preview/apply. */
export interface PersonImportIndexRow {
  id: string;
  name: string;
  familyName: string | null;
  birthday: Date | null;
  phone: string | null;
  email: string | null;
  addressLine: string | null;
  city: string | null;
  notes: string | null;
}
