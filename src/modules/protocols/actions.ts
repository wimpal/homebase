"use server";

import { requireAdmin, requireHousehold } from "@/core/auth/session";
import { requireModule } from "@/core/modules/guard";
import { isDomainError } from "@/domain/error";
import { listDeviceLocations, listNetworkDevicesForUi } from "@/domain/network";
import {
  getCinemaSettings,
  upsertCinemaSettings,
  type CinemaSettingsDto,
} from "@/domain/protocols";
import { listDirigeraLights } from "@/domain/smarthome";
import {
  fromDomainError,
  okResult,
  type ActionResult,
} from "@/lib/action-result";
import { ModuleId } from "@prisma/client";
import { revalidatePath } from "next/cache";

async function adminProtocols() {
  const ctx = await requireAdmin();
  await requireModule(ctx.householdId, ModuleId.PROTOCOLS);
  return ctx;
}

export type ProtocolsPageData = {
  settings: CinemaSettingsDto;
  tvOptions: { id: string; name: string }[];
  locations: { id: string; name: string; slug: string }[];
  lights: { id: string; name: string; room?: string }[];
  dirigeraRooms: string[];
};

export async function getProtocolsPageData(): Promise<ProtocolsPageData> {
  const { householdId } = await requireHousehold();
  await requireModule(householdId, ModuleId.PROTOCOLS);

  const [settingsResult, devicesResult, locations, lightsResult] =
    await Promise.all([
      getCinemaSettings(householdId),
      listNetworkDevicesForUi(householdId, { include_retired: false }),
      listDeviceLocations(householdId),
      listDirigeraLights(),
    ]);

  const settings = isDomainError(settingsResult)
    ? {
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
        timezone: "Europe/Amsterdam",
      }
    : settingsResult;

  const devices = isDomainError(devicesResult) ? [] : devicesResult;
  const tvOptions = devices
    .filter((d) => d.tv_capable && d.wake_capable)
    .map((d) => ({ id: d.id, name: d.name }));

  const lights = isDomainError(lightsResult)
    ? []
    : lightsResult.map((l) => ({
        id: l.id,
        name: l.name,
        room: l.room,
      }));

  const roomSet = new Set<string>();
  for (const l of lights) {
    if (l.room?.trim()) roomSet.add(l.room.trim());
  }

  return {
    settings,
    tvOptions,
    locations: locations.map((l) => ({
      id: l.id,
      name: l.name,
      slug: l.slug,
    })),
    lights,
    dirigeraRooms: [...roomSet].sort((a, b) => a.localeCompare(b)),
  };
}

export async function saveCinemaSettingsAction(
  formData: FormData,
): Promise<ActionResult> {
  const { householdId } = await adminProtocols();

  const sunsetLinkRaw = String(formData.get("sunsetLinkEnabled") ?? "");
  const sunsetLinkEnabled =
    sunsetLinkRaw === "true" ||
    sunsetLinkRaw === "on" ||
    sunsetLinkRaw === "1";

  const minutesRaw = String(formData.get("minutesBeforeSunset") ?? "").trim();
  const minutesParsed = minutesRaw === "" ? null : Number.parseInt(minutesRaw, 10);

  const selectedLightIds = formData
    .getAll("selectedLightIds")
    .map((v) => String(v).trim())
    .filter(Boolean);

  const networkDeviceId = String(formData.get("networkDeviceId") ?? "").trim();
  const deviceLocationId = String(formData.get("deviceLocationId") ?? "").trim();
  const dirigeraRoomName = String(formData.get("dirigeraRoomName") ?? "").trim();

  const dimRaw = Number.parseInt(String(formData.get("dimBrightness") ?? "30"), 10);
  // HTML type=time may submit HH:MM:SS — normalize like Automations (T-066).
  const cutoffRaw = String(formData.get("cutoffHhMm") ?? "18:00").trim();
  const cutoffHhMm =
    cutoffRaw.length >= 5 ? cutoffRaw.slice(0, 5) : cutoffRaw;

  const result = await upsertCinemaSettings(householdId, {
    networkDeviceId: networkDeviceId || null,
    deviceLocationId: deviceLocationId || null,
    dirigeraRoomName: dirigeraRoomName || null,
    selectedLightIds,
    dimBrightness: Number.isFinite(dimRaw) ? dimRaw : 30,
    cutoffHhMm,
    sunsetLinkEnabled,
    minutesBeforeSunset: sunsetLinkEnabled ? minutesParsed : null,
  });

  if (isDomainError(result)) return fromDomainError(result);
  revalidatePath("/protocols");
  return okResult();
}
