/** T-111 Dirigera → Network inventory import DTOs (ADMIN preview + confirm). */

export type DirigeraImportLocationStatus = "matched" | "missing" | "none";

export type DirigeraImportCandidateStatus =
  | "new"
  | "already_enrolled"
  | "retired_match";

export type DirigeraImportCandidate = {
  dirigeraId: string;
  name: string;
  /** Raw Dirigera deviceType for UI display. */
  deviceType: string;
  /** Mapped Network device type slug. */
  typeSlug: string;
  roomName?: string;
  /** Proposed Device location slug ("unknown" when no match). */
  locationSlug: string;
  locationStatus: DirigeraImportLocationStatus;
  status: DirigeraImportCandidateStatus;
  existingDeviceId?: string;
};

export type DirigeraImportPreview = {
  candidates: DirigeraImportCandidate[];
};

export type ConfirmDirigeraImportInput = {
  /** Whitelist of hub device ids the ADMIN checked. */
  selectedDirigeraIds: string[];
  /** When true, create missing locations from Dirigera room names. */
  createMissingLocations: boolean;
};

export type ConfirmDirigeraImportSummary = {
  created: number;
  skipped_enrolled: number;
  skipped_retired: number;
  skipped_missing_on_hub: number;
  locations_created: number;
  failed: Array<{ dirigeraId: string; message: string }>;
};
