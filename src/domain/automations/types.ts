export const AUTOMATION_TIMEZONE_V1 = "Europe/Amsterdam";

export const LAST_RUN_RESULT_MAX = 500;

/** Fixed defaults — not UI knobs. 10s cooldown: door open/close cycles must re-fire soon. */
export const SENSOR_DEBOUNCE_MS = 2000;
export const SENSOR_COOLDOWN_MS = 10_000;

export const SENSOR_EDGE_ATTRIBUTES = ["isOpen", "isDetected"] as const;
export type SensorEdgeAttribute = (typeof SENSOR_EDGE_ATTRIBUTES)[number];

export const SENSOR_EDGE_POLARITIES = ["rising", "falling"] as const;
export type SensorEdgePolarity = (typeof SENSOR_EDGE_POLARITIES)[number];

/** Leave-session states for SENSOR_EDGE Toggle rules. */
export const TOGGLE_SESSIONS = ["idle", "occupied", "leaving"] as const;
export type ToggleSession = (typeof TOGGLE_SESSIONS)[number];

export type LightAutomationTriggerKind =
  | "SCHEDULE"
  | "SENSOR_EDGE"
  | "BUTTON";

/** Dirigera remotePressEvent clickPattern values (BUTTON identity). */
export const BUTTON_CLICK_PATTERNS = [
  "singlePress",
  "doublePress",
  "longPress",
] as const;
export type ButtonClickPattern = (typeof BUTTON_CLICK_PATTERNS)[number];

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
  /** Optional active window start HH:MM; both null = all day. */
  activeFromLocal: string | null;
  /** Optional active window end HH:MM; both null = all day. */
  activeUntilLocal: string | null;
  sensorDirigeraDeviceId: string | null;
  sensorEdgeAttribute: string | null;
  sensorEdgePolarity: SensorEdgePolarity | null;
  /** BUTTON: Dirigera controller device id (one per physical button on Bilresa). */
  buttonDirigeraDeviceId: string | null;
  /** BUTTON: clickPattern singlePress | doublePress | longPress. */
  buttonIdentity: string | null;
  on: boolean;
  /** SENSOR_EDGE leave-session: enter Open→on, leave Open+Close→off. */
  toggle: boolean;
  toggleSession: ToggleSession;
  brightness: number | null;
  colorTempKelvin: number | null;
  /** SCHEDULE only: daily adjuster rewrites timeLocal from sunset − offset. */
  sunsetLinkEnabled: boolean;
  minutesBeforeSunset: number | null;
  sunsetLastAdjustAt: Date | null;
  sunsetLastAdjustResult: string | null;
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
  /** Optional active window start HH:MM; both null/omit = all day. */
  activeFromLocal?: string | null;
  /** Optional active window end HH:MM; both null/omit = all day. */
  activeUntilLocal?: string | null;
  /** Required for SENSOR_EDGE. */
  sensorDirigeraDeviceId?: string | null;
  /** Required for SENSOR_EDGE: isOpen | isDetected. */
  sensorEdgeAttribute?: string | null;
  /** Required for SENSOR_EDGE on/off rules: rising | falling. Unused when toggle. */
  sensorEdgePolarity?: string | null;
  /** Required for BUTTON. */
  buttonDirigeraDeviceId?: string | null;
  /** Required for BUTTON: singlePress | doublePress | longPress. */
  buttonIdentity?: string | null;
  on: boolean;
  /** SENSOR_EDGE leave-session. When true, `on` is ignored at apply.
   *  BUTTON: when true, flip each target's current isOn on each press. */
  toggle?: boolean;
  brightness?: number | null;
  colorTempKelvin?: number | null;
  /** SCHEDULE only. When true, minutesBeforeSunset required (0–180). */
  sunsetLinkEnabled?: boolean;
  minutesBeforeSunset?: number | null;
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
  /**
   * For leave-session toggle writes: force desired on/off instead of flipping.
   * Ignored when the rule is not toggle.
   */
  forceOn?: boolean;
}

export function normalizeToggleSession(
  value: string | null | undefined,
): ToggleSession {
  if (value === "occupied" || value === "leaving") return value;
  return "idle";
}
