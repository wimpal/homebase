import { prisma } from "@/core/db";
import { DomainError, isDomainError } from "@/domain/error";
import { AUTOMATION_TIMEZONE_V1 } from "@/domain/automations/types";
import { assertProtocolsEnabled } from "./module-gate";
import { isValidCutoffHhMm } from "./cutoff";
import type { CinemaSettingsDto, CinemaSettingsInput } from "./types";

const DEFAULT_SETTINGS: Omit<CinemaSettingsDto, "timezone"> = {
  networkDeviceId: null,
  deviceLocationId: null,
  dirigeraRoomName: null,
  selectedLightIds: [],
  dimBrightness: 30,
  cutoffHhMm: "18:00",
  sunsetLinkEnabled: false,
  minutesBeforeSunset: null,
  sunsetLastAdjustAt: null,
  sunsetLastAdjustResult: null,
};

function rowToDto(
  row: {
    networkDeviceId: string | null;
    deviceLocationId: string | null;
    dirigeraRoomName: string | null;
    selectedLightIds: string[];
    dimBrightness: number;
    cutoffHhMm: string;
    sunsetLinkEnabled: boolean;
    minutesBeforeSunset: number | null;
    sunsetLastAdjustAt: Date | null;
    sunsetLastAdjustResult: string | null;
  },
  timezone: string,
): CinemaSettingsDto {
  return {
    networkDeviceId: row.networkDeviceId,
    deviceLocationId: row.deviceLocationId,
    dirigeraRoomName: row.dirigeraRoomName,
    selectedLightIds: [...row.selectedLightIds],
    dimBrightness: row.dimBrightness,
    cutoffHhMm: row.cutoffHhMm,
    sunsetLinkEnabled: row.sunsetLinkEnabled,
    minutesBeforeSunset: row.minutesBeforeSunset,
    sunsetLastAdjustAt: row.sunsetLastAdjustAt
      ? row.sunsetLastAdjustAt.toISOString()
      : null,
    sunsetLastAdjustResult: row.sunsetLastAdjustResult,
    timezone,
  };
}

export async function getCinemaSettings(
  householdId: string,
): Promise<CinemaSettingsDto | DomainError> {
  const gated = await assertProtocolsEnabled(householdId);
  if (gated) return gated;

  const household = await prisma.household.findUnique({
    where: { id: householdId },
    select: { timezone: true },
  });
  const timezone = household?.timezone || AUTOMATION_TIMEZONE_V1;

  const row = await prisma.protocolCinemaSettings.findUnique({
    where: { householdId },
  });
  if (!row) {
    return { ...DEFAULT_SETTINGS, timezone };
  }
  return rowToDto(row, timezone);
}

export async function upsertCinemaSettings(
  householdId: string,
  input: CinemaSettingsInput,
): Promise<CinemaSettingsDto | DomainError> {
  const gated = await assertProtocolsEnabled(householdId);
  if (gated) return gated;

  const validated = await validateCinemaSettingsInput(householdId, input);
  if (isDomainError(validated)) return validated;

  const existing = await prisma.protocolCinemaSettings.findUnique({
    where: { householdId },
    select: {
      sunsetLinkEnabled: true,
      minutesBeforeSunset: true,
    },
  });

  const sunsetChanged =
    !existing ||
    existing.sunsetLinkEnabled !== validated.sunsetLinkEnabled ||
    existing.minutesBeforeSunset !== validated.minutesBeforeSunset;

  const clearSunsetStatus =
    sunsetChanged || validated.sunsetLinkEnabled === false;

  const household = await prisma.household.findUnique({
    where: { id: householdId },
    select: { timezone: true },
  });
  const timezone = household?.timezone || AUTOMATION_TIMEZONE_V1;

  const row = await prisma.protocolCinemaSettings.upsert({
    where: { householdId },
    create: {
      householdId,
      networkDeviceId: validated.networkDeviceId,
      deviceLocationId: validated.deviceLocationId,
      dirigeraRoomName: validated.dirigeraRoomName,
      selectedLightIds: validated.selectedLightIds,
      dimBrightness: validated.dimBrightness,
      cutoffHhMm: validated.cutoffHhMm,
      sunsetLinkEnabled: validated.sunsetLinkEnabled,
      minutesBeforeSunset: validated.minutesBeforeSunset,
      sunsetLastAdjustAt: null,
      sunsetLastAdjustResult: null,
    },
    update: {
      networkDeviceId: validated.networkDeviceId,
      deviceLocationId: validated.deviceLocationId,
      dirigeraRoomName: validated.dirigeraRoomName,
      selectedLightIds: validated.selectedLightIds,
      dimBrightness: validated.dimBrightness,
      cutoffHhMm: validated.cutoffHhMm,
      sunsetLinkEnabled: validated.sunsetLinkEnabled,
      minutesBeforeSunset: validated.minutesBeforeSunset,
      ...(clearSunsetStatus
        ? { sunsetLastAdjustAt: null, sunsetLastAdjustResult: null }
        : {}),
    },
  });

  return rowToDto(row, timezone);
}

async function validateCinemaSettingsInput(
  householdId: string,
  input: CinemaSettingsInput,
): Promise<CinemaSettingsInput | DomainError> {
  const dim = input.dimBrightness;
  if (!Number.isInteger(dim) || dim < 0 || dim > 100) {
    return DomainError.invalidInput(
      "Dim brightness must be an integer from 0 to 100.",
      "invalid_dim",
    );
  }

  const cutoff = (input.cutoffHhMm ?? "").trim();
  if (!isValidCutoffHhMm(cutoff)) {
    return DomainError.invalidInput(
      "Cutoff must be HH:MM in 24-hour format.",
      "invalid_cutoff",
    );
  }

  const sunsetLinkEnabled = input.sunsetLinkEnabled === true;
  let minutesBeforeSunset: number | null = null;
  if (sunsetLinkEnabled) {
    const offset = input.minutesBeforeSunset;
    if (
      offset === null ||
      offset === undefined ||
      !Number.isInteger(offset) ||
      offset < 0 ||
      offset > 180
    ) {
      return DomainError.invalidInput(
        "Minutes before sunset must be an integer from 0 to 180 when Sunset link is on.",
        "invalid_sunset_offset",
      );
    }
    minutesBeforeSunset = offset;
  }

  const locationId = input.deviceLocationId?.trim() || null;
  const roomName = input.dirigeraRoomName?.trim() || null;
  if ((locationId && !roomName) || (!locationId && roomName)) {
    return DomainError.invalidInput(
      "Device location and Dirigera room must both be set or both empty.",
      "incomplete_room_map",
    );
  }
  if (locationId) {
    const loc = await prisma.deviceLocation.findFirst({
      where: { id: locationId, householdId },
      select: { id: true },
    });
    if (!loc) {
      return DomainError.invalidInput(
        "Device location not found in this household.",
        "location_not_found",
      );
    }
  }

  let networkDeviceId: string | null = input.networkDeviceId?.trim() || null;
  if (networkDeviceId) {
    const tv = await prisma.networkDevice.findFirst({
      where: { id: networkDeviceId, householdId },
    });
    if (!tv) {
      return DomainError.invalidInput(
        "TV network device not found in this household.",
        "tv_not_found",
      );
    }
    if (tv.retiredAt) {
      return DomainError.invalidInput(
        "Cannot use a retired TV for Cinema.",
        "tv_retired",
      );
    }
    if (!tv.ssapClientKey) {
      return DomainError.invalidInput(
        "Selected TV is not paired for SSAP (not tv_capable).",
        "tv_not_capable",
      );
    }
    if (!tv.wakeAllowed || !tv.macAddress) {
      return DomainError.invalidInput(
        "Selected TV must be wake-allowlisted with a MAC (wake_capable) for Cinema.",
        "tv_not_wake_capable",
      );
    }
  } else {
    networkDeviceId = null;
  }

  const selectedLightIds = [
    ...new Set(
      (input.selectedLightIds ?? [])
        .map((id) => id.trim())
        .filter((id) => id.length > 0),
    ),
  ];

  return {
    networkDeviceId,
    deviceLocationId: locationId,
    dirigeraRoomName: roomName,
    selectedLightIds,
    dimBrightness: dim,
    cutoffHhMm: cutoff,
    sunsetLinkEnabled,
    minutesBeforeSunset,
  };
}
