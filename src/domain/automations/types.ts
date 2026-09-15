export const AUTOMATION_TIMEZONE_V1 = "Europe/Amsterdam";

export const LAST_RUN_RESULT_MAX = 500;

/** Fixed T-067 defaults — not UI knobs. */
export const SENSOR_DEBOUNCE_MS = 2000;
export const SENSOR_COOLDOWN_MS = 90_000;

export const SENSOR_EDGE_ATTRIBUTES = ["isOpen", "isDetected"] as const;
export type SensorEdgeAttribute = (typeof SENSOR_EDGE_ATTRIBUTES)[number];

export const SENSOR_EDGE_POLARITIES = ["rising", "falling"] as const;
export type SensorEdgePolarity = (typeof SENSOR_EDGE_POLARITIES)[number];

export type LightAutomationTriggerKind = "SCHEDULE" | "SENSOR_EDGE";

export interface LightAutomationTargetDto {
  id: string;
  dirigeraDeviceId: string;
}

export interface LightAutomationDto {
  id: string;
  householdId: string;
  name: string;
  enabled: boolean;
  triggerKind: LightAutomationTriggerKind;
  timeLocal: string | null;
  daysOfWeek: number[];
  timezone: string;
  sensorDirigeraDeviceId: string | null;
  sensorEdgeAttribute: string | null;
  sensorEdgePolarity: SensorEdgePolarity | null;
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
  triggerKind?: LightAutomationTriggerKind;
  /** Required for SCHEDULE. */
  timeLocal?: string | null;
  /** Required non-empty for SCHEDULE; empty for SENSOR_EDGE. */
  daysOfWeek?: number[];
  timezone?: string;
  /** Required for SENSOR_EDGE. */
  sensorDirigeraDeviceId?: string | null;
  /** Required for SENSOR_EDGE: isOpen | isDetected. */
  sensorEdgeAttribute?: string | null;
  /** Required for SENSOR_EDGE: rising | falling. */
  sensorEdgePolarity?: string | null;
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

export interface ApplyAutomationOptions {
  /** If set, only these target device ids are written (must be a subset). */
  onlyDeviceIds?: string[];
  /**
   * When false, leave lastRunAt unchanged (sensor path already claimed cooldown).
   * Default true.
   */
  updateLastRunAt?: boolean;
}
