import { DomainError, isDomainError } from "@/domain/error";
import {
  listDirigeraEdgeSensors,
  listDirigeraLights,
} from "@/domain/smarthome";
import {
  AUTOMATION_TIMEZONE_V1,
  LAST_RUN_RESULT_MAX,
  SENSOR_EDGE_ATTRIBUTES,
  SENSOR_EDGE_POLARITIES,
  type AutomationWriteInput,
  type LightAutomationTriggerKind,
  type SensorEdgeAttribute,
  type SensorEdgePolarity,
} from "./types";

const TIME_LOCAL_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const NAME_MAX = 100;

export type ValidatedAutomationWrite = {
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
  toggle: boolean;
  brightness: number | null;
  colorTempKelvin: number | null;
  targetDeviceIds: string[];
};

function isSensorEdgeAttribute(value: string): value is SensorEdgeAttribute {
  return (SENSOR_EDGE_ATTRIBUTES as readonly string[]).includes(value);
}

function isSensorEdgePolarity(value: string): value is SensorEdgePolarity {
  return (SENSOR_EDGE_POLARITIES as readonly string[]).includes(value);
}

/**
 * Validate create/update payload. Resolves Dirigera targets (and sensors) against the live hub.
 */
export async function validateAutomationWrite(
  input: AutomationWriteInput,
): Promise<ValidatedAutomationWrite | DomainError> {
  const name = input.name?.trim() ?? "";
  if (!name) {
    return DomainError.invalidInput("Automation name is required.");
  }
  if (name.length > NAME_MAX) {
    return DomainError.invalidInput(
      `Automation name must be at most ${NAME_MAX} characters.`,
    );
  }

  const triggerKind: LightAutomationTriggerKind =
    input.triggerKind === "SENSOR_EDGE" ? "SENSOR_EDGE" : "SCHEDULE";

  const timezone = (input.timezone ?? AUTOMATION_TIMEZONE_V1).trim();
  if (timezone !== AUTOMATION_TIMEZONE_V1) {
    return DomainError.invalidInput(
      `timezone must be ${AUTOMATION_TIMEZONE_V1} in v1.`,
    );
  }

  const toggle = input.toggle === true;

  if (toggle && triggerKind !== "SENSOR_EDGE") {
    return DomainError.invalidInput(
      "toggle is only allowed for SENSOR_EDGE automations.",
    );
  }

  // Toggle persists on=true as a NOT NULL dummy; apply ignores it.
  const on = toggle ? true : input.on;
  if (typeof on !== "boolean") {
    return DomainError.invalidInput("on must be a boolean.");
  }

  // Brightness/kelvin allowed when turning on, or when toggle (applied only on ON flips).
  const allowLevel = on || toggle;

  let brightness: number | null = null;
  if (input.brightness !== undefined && input.brightness !== null) {
    if (!allowLevel) {
      return DomainError.invalidInput(
        "brightness can only be set when on is true (or toggle).",
      );
    }
    if (
      !Number.isInteger(input.brightness) ||
      input.brightness < 0 ||
      input.brightness > 100
    ) {
      return DomainError.invalidInput("brightness must be an integer 0–100.");
    }
    brightness = input.brightness;
  }

  let colorTempKelvin: number | null = null;
  if (input.colorTempKelvin !== undefined && input.colorTempKelvin !== null) {
    if (!allowLevel) {
      return DomainError.invalidInput(
        "colorTempKelvin can only be set when on is true (or toggle).",
      );
    }
    if (
      !Number.isInteger(input.colorTempKelvin) ||
      input.colorTempKelvin <= 0
    ) {
      return DomainError.invalidInput(
        "colorTempKelvin must be a positive integer.",
      );
    }
    colorTempKelvin = input.colorTempKelvin;
  }

  if (
    !Array.isArray(input.targetDeviceIds) ||
    input.targetDeviceIds.length === 0
  ) {
    return DomainError.invalidInput(
      "At least one target light (Dirigera device id) is required.",
    );
  }

  const uniqueTargets = [
    ...new Set(
      input.targetDeviceIds.map((id) => id.trim()).filter((id) => id.length > 0),
    ),
  ];
  if (uniqueTargets.length === 0) {
    return DomainError.invalidInput(
      "At least one target light (Dirigera device id) is required.",
    );
  }

  const lights = await listDirigeraLights();
  if (isDomainError(lights)) {
    return lights;
  }
  const knownLightIds = new Set(lights.map((l) => l.id));
  for (const id of uniqueTargets) {
    if (!knownLightIds.has(id)) {
      return DomainError.invalidInput(
        `Unknown or stale Dirigera device id: ${id}`,
      );
    }
  }

  if (triggerKind === "SENSOR_EDGE") {
    const sensorId = input.sensorDirigeraDeviceId?.trim() ?? "";
    if (!sensorId) {
      return DomainError.invalidInput(
        "sensorDirigeraDeviceId is required for SENSOR_EDGE automations.",
      );
    }

    const attrRaw = input.sensorEdgeAttribute?.trim() ?? "";
    if (!isSensorEdgeAttribute(attrRaw)) {
      return DomainError.invalidInput(
        'sensorEdgeAttribute must be "isOpen" or "isDetected".',
      );
    }

    const polarityRaw = (
      input.sensorEdgePolarity?.trim() || "rising"
    ).toLowerCase();
    if (!isSensorEdgePolarity(polarityRaw)) {
      return DomainError.invalidInput(
        'sensorEdgePolarity must be "rising" or "falling".',
      );
    }

    if (toggle && polarityRaw !== "rising") {
      return DomainError.invalidInput(
        "toggle requires sensorEdgePolarity \"rising\" (Opens/Detects).",
      );
    }

    const sensors = await listDirigeraEdgeSensors();
    if (isDomainError(sensors)) {
      return sensors;
    }
    const sensor = sensors.find((s) => s.id === sensorId);
    if (!sensor) {
      return DomainError.invalidInput(
        `Unknown or stale Dirigera sensor id: ${sensorId}`,
      );
    }
    if (sensor.edgeAttribute !== attrRaw) {
      return DomainError.invalidInput(
        `sensorEdgeAttribute must be "${sensor.edgeAttribute}" for this sensor type.`,
      );
    }

    return {
      name,
      enabled: input.enabled ?? true,
      triggerKind,
      timeLocal: null,
      daysOfWeek: [],
      timezone,
      sensorDirigeraDeviceId: sensorId,
      sensorEdgeAttribute: attrRaw,
      sensorEdgePolarity: polarityRaw,
      on,
      toggle,
      brightness: allowLevel ? brightness : null,
      colorTempKelvin: allowLevel ? colorTempKelvin : null,
      targetDeviceIds: uniqueTargets,
    };
  }

  // SCHEDULE
  const timeLocal = input.timeLocal?.trim() ?? "";
  if (!TIME_LOCAL_RE.test(timeLocal)) {
    return DomainError.invalidInput(
      "timeLocal must be HH:MM in 24-hour form (e.g. 21:00).",
    );
  }

  if (!Array.isArray(input.daysOfWeek) || input.daysOfWeek.length === 0) {
    return DomainError.invalidInput(
      "daysOfWeek must include at least one ISO weekday (1=Mon … 7=Sun).",
    );
  }

  const daySet = new Set<number>();
  for (const day of input.daysOfWeek) {
    if (!Number.isInteger(day) || day < 1 || day > 7) {
      return DomainError.invalidInput(
        "daysOfWeek values must be integers 1 (Mon) through 7 (Sun).",
      );
    }
    daySet.add(day);
  }
  const daysOfWeek = [...daySet].sort((a, b) => a - b);

  return {
    name,
    enabled: input.enabled ?? true,
    triggerKind: "SCHEDULE",
    timeLocal,
    daysOfWeek,
    timezone,
    sensorDirigeraDeviceId: null,
    sensorEdgeAttribute: null,
    sensorEdgePolarity: null,
    on,
    toggle: false,
    brightness: on ? brightness : null,
    colorTempKelvin: on ? colorTempKelvin : null,
    targetDeviceIds: uniqueTargets,
  };
}

export function truncateLastRunResult(message: string): string {
  if (message.length <= LAST_RUN_RESULT_MAX) {
    return message;
  }
  return `${message.slice(0, LAST_RUN_RESULT_MAX - 1)}…`;
}
