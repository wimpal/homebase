export const AUTOMATION_TIMEZONE_V1 = "Europe/Amsterdam";

export const LAST_RUN_RESULT_MAX = 500;

export interface LightAutomationTargetDto {
  id: string;
  dirigeraDeviceId: string;
}

export interface LightAutomationDto {
  id: string;
  householdId: string;
  name: string;
  enabled: boolean;
  timeLocal: string;
  daysOfWeek: number[];
  timezone: string;
  on: boolean;
  brightness: number | null;
  colorTempKelvin: number | null;
  lastRunAt: Date | null;
  lastRunResult: string | null;
  lastFiredSlot: string | null;
  createdAt: Date;
  updatedAt: Date;
  targets: LightAutomationTargetDto[];
}

export interface AutomationWriteInput {
  name: string;
  enabled?: boolean;
  timeLocal: string;
  daysOfWeek: number[];
  timezone?: string;
  on: boolean;
  brightness?: number | null;
  colorTempKelvin?: number | null;
  /** Dirigera device ids to target (at least one). */
  targetDeviceIds: string[];
}

export interface ApplyAutomationResult {
  id: string;
  lastRunAt: Date;
  lastRunResult: string;
  attempted: number;
  succeeded: number;
  failed: number;
}
