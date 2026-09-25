export type CinemaSettingsDto = {
  networkDeviceId: string | null;
  deviceLocationId: string | null;
  dirigeraRoomName: string | null;
  selectedLightIds: string[];
  dimBrightness: number;
  cutoffHhMm: string;
  sunsetLinkEnabled: boolean;
  minutesBeforeSunset: number | null;
  sunsetLastAdjustAt: string | null;
  sunsetLastAdjustResult: string | null;
  timezone: string;
};

export type CinemaSettingsInput = {
  networkDeviceId: string | null;
  deviceLocationId: string | null;
  dirigeraRoomName: string | null;
  selectedLightIds: string[];
  dimBrightness: number;
  cutoffHhMm: string;
  sunsetLinkEnabled: boolean;
  minutesBeforeSunset: number | null;
};

export type ProtocolRunStatus =
  | "ok"
  | "ok_tv_only"
  | "already_running"
  | "failed"
  | "not_found";

export type ProtocolLightSkippedReason =
  | "before_cutoff"
  | "empty_selection"
  | "tv_failed";

export type ProtocolRunResult = {
  success: boolean;
  id?: string;
  name?: string;
  status: ProtocolRunStatus;
  tv?: { ok: boolean; error?: string };
  lights?: {
    applied: boolean;
    skipped_reason?: ProtocolLightSkippedReason;
    cutoff_hhmm?: string;
    results?: { device_id: string; success: boolean; error?: string }[];
  };
  notes?: string[];
  error?: string;
};

export type RunCinemaDeps = {
  now?: Date;
  launchTv?: (
    householdId: string,
    deviceId: string,
  ) => Promise<
    { ok: true; dry_run?: boolean } | { ok: false; error: string }
  >;
  setLight?: (
    deviceId: string,
    on: boolean,
    brightness: number,
  ) => Promise<{ success: boolean; error?: string }>;
};
