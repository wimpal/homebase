import { DomainError, isDomainError } from "@/domain/error";
import { listDirigeraLights } from "@/domain/smarthome";
import {
  AUTOMATION_TIMEZONE_V1,
  LAST_RUN_RESULT_MAX,
  type AutomationWriteInput,
} from "./types";

const TIME_LOCAL_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const NAME_MAX = 100;

export type ValidatedAutomationWrite = {
  name: string;
  enabled: boolean;
  timeLocal: string;
  daysOfWeek: number[];
  timezone: string;
  on: boolean;
  brightness: number | null;
  colorTempKelvin: number | null;
  targetDeviceIds: string[];
};

/**
 * Validate create/update payload. Resolves Dirigera targets against the live hub.
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

  const timezone = (input.timezone ?? AUTOMATION_TIMEZONE_V1).trim();
  if (timezone !== AUTOMATION_TIMEZONE_V1) {
    return DomainError.invalidInput(
      `timezone must be ${AUTOMATION_TIMEZONE_V1} in v1.`,
    );
  }

  if (typeof input.on !== "boolean") {
    return DomainError.invalidInput("on must be a boolean.");
  }

  let brightness: number | null = null;
  if (input.brightness !== undefined && input.brightness !== null) {
    if (!input.on) {
      return DomainError.invalidInput(
        "brightness can only be set when on is true.",
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
    if (!input.on) {
      return DomainError.invalidInput(
        "colorTempKelvin can only be set when on is true.",
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
  const knownIds = new Set(lights.map((l) => l.id));
  for (const id of uniqueTargets) {
    if (!knownIds.has(id)) {
      return DomainError.invalidInput(
        `Unknown or stale Dirigera device id: ${id}`,
      );
    }
  }

  return {
    name,
    enabled: input.enabled ?? true,
    timeLocal,
    daysOfWeek,
    timezone,
    on: input.on,
    brightness,
    colorTempKelvin,
    targetDeviceIds: uniqueTargets,
  };
}

export function truncateLastRunResult(message: string): string {
  if (message.length <= LAST_RUN_RESULT_MAX) {
    return message;
  }
  return `${message.slice(0, LAST_RUN_RESULT_MAX - 1)}…`;
}
