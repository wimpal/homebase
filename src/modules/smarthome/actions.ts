"use server";

import { prisma } from "@/core/db";
import { requireHousehold, requireMutationAccess } from "@/core/auth/session";
import { assertDevice } from "@/core/tenancy/assertHouseholdResource";
import { isDomainError } from "@/domain/error";
import type { LightAutomationDto } from "@/domain/automations";
import {
  applyAutomationAction,
  createAutomation,
  deleteAutomation,
  getAutomation,
  listAutomations,
  setAutomationEnabled,
  updateAutomation,
} from "@/domain/automations";
import {
  isDirigeraConfigured,
  listDirigeraEdgeSensors,
  listDirigeraLights,
  reolinkCameraConfigSchema,
  sanitizeDeviceConfig,
  setDirigeraLightState,
  type DeviceConfigPublic,
  type DirigeraEdgeSensor,
  type DirigeraLight,
} from "@/domain/smarthome";
import { ModuleId } from "@prisma/client";
import { revalidatePath } from "next/cache";

export type DeviceForUi = {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  config: DeviceConfigPublic;
};

/** Devices with secrets stripped — safe for client components / server actions. */
export async function getDevicesForUi(): Promise<DeviceForUi[]> {
  const { householdId } = await requireHousehold();
  const devices = await prisma.device.findMany({ where: { householdId } });
  return devices.map((d) => ({
    id: d.id,
    name: d.name,
    type: d.type,
    enabled: d.enabled,
    config: sanitizeDeviceConfig(d.config),
  }));
}

export async function getSensorReadings(limit = 24) {
  const { householdId } = await requireHousehold();
  return prisma.sensorReading.findMany({
    where: { householdId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function addSensorReading(formData: FormData) {
  const { householdId } = await requireMutationAccess(ModuleId.SMART_HOME);
  const deviceId = (formData.get("deviceId") as string) || undefined;
  if (deviceId) await assertDevice(householdId, deviceId);
  await prisma.sensorReading.create({
    data: {
      householdId,
      deviceId,
      temperature: formData.get("temperature")
        ? parseFloat(formData.get("temperature") as string)
        : undefined,
      humidity: formData.get("humidity")
        ? parseFloat(formData.get("humidity") as string)
        : undefined,
      airQuality: formData.get("airQuality")
        ? parseFloat(formData.get("airQuality") as string)
        : undefined,
    },
  });
  revalidatePath("/smart-home");
}

export async function createDevice(formData: FormData) {
  const { householdId } = await requireMutationAccess(ModuleId.SMART_HOME);
  await prisma.device.create({
    data: {
      householdId,
      name: formData.get("name") as string,
      type: (formData.get("type") as "SENSOR" | "LIGHT" | "CAMERA" | "OTHER") || "OTHER",
      config: formData.get("config")
        ? JSON.parse(formData.get("config") as string)
        : undefined,
    },
  });
  revalidatePath("/smart-home");
}

/** Add a Reolink camera (host + local credentials). Password stored server-side only. */
export async function createCamera(formData: FormData) {
  const { householdId } = await requireMutationAccess(ModuleId.SMART_HOME);

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    throw new Error("Camera name is required.");
  }

  const parsed = reolinkCameraConfigSchema.safeParse({
    provider: "reolink",
    host: String(formData.get("host") ?? "").trim(),
    username: String(formData.get("username") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
    rtspPort: 554,
    stream: "sub",
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid camera settings.");
  }

  await prisma.device.create({
    data: {
      householdId,
      name,
      type: "CAMERA",
      config: parsed.data,
    },
  });
  revalidatePath("/smart-home");
}

export async function deleteDevice(formData: FormData) {
  const { householdId } = await requireMutationAccess(ModuleId.SMART_HOME);
  const id = formData.get("id") as string;
  if (!id) return;
  await assertDevice(householdId, id);
  await prisma.device.delete({ where: { id } });
  revalidatePath("/smart-home");
}

export type DirigeraLightsResult =
  | { configured: false; lights: DirigeraLight[]; error?: string }
  | { configured: true; lights: DirigeraLight[]; error?: string };

export async function getDirigeraLights(): Promise<DirigeraLightsResult> {
  await requireHousehold();

  if (!isDirigeraConfigured()) {
    return { configured: false, lights: [] };
  }

  const result = await listDirigeraLights();
  if (isDomainError(result)) {
    return {
      configured: true,
      lights: [],
      error: result.message,
    };
  }

  return { configured: true, lights: result };
}

export async function controlDirigeraLight(
  deviceId: string,
  on: boolean,
  options?: {
    brightness?: number;
    colorTempKelvin?: number;
    colorHex?: string;
    colorPreset?: string;
  },
) {
  await requireMutationAccess(ModuleId.SMART_HOME);
  const result = await setDirigeraLightState(deviceId, on, options);
  revalidatePath("/smart-home");
  return result;
}

/** Serializable automation row for the Smart Home UI (T-065 / T-068). */
export type AutomationListItem = {
  id: string;
  name: string;
  enabled: boolean;
  triggerKind: "SCHEDULE" | "SENSOR_EDGE";
  timeLocal: string | null;
  daysOfWeek: number[];
  activeFromLocal: string | null;
  activeUntilLocal: string | null;
  sensorDirigeraDeviceId: string | null;
  sensorEdgeAttribute: string | null;
  sensorEdgePolarity: "rising" | "falling" | null;
  on: boolean;
  toggle: boolean;
  toggleSession: "idle" | "occupied" | "leaving";
  brightness: number | null;
  colorTempKelvin: number | null;
  sunsetLinkEnabled: boolean;
  minutesBeforeSunset: number | null;
  sunsetLastAdjustAt: string | null;
  sunsetLastAdjustResult: string | null;
  lastRunAt: string | null;
  lastRunResult: string | null;
  targets: { id: string; dirigeraDeviceId: string }[];
};

export type DirigeraEdgeSensorsResult =
  | { configured: false; sensors: [] }
  | { configured: true; sensors: DirigeraEdgeSensor[]; error?: string };

function toAutomationListItem(row: LightAutomationDto): AutomationListItem {
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    triggerKind: row.triggerKind,
    timeLocal: row.timeLocal,
    daysOfWeek: row.daysOfWeek,
    activeFromLocal: row.activeFromLocal,
    activeUntilLocal: row.activeUntilLocal,
    sensorDirigeraDeviceId: row.sensorDirigeraDeviceId,
    sensorEdgeAttribute: row.sensorEdgeAttribute,
    sensorEdgePolarity: row.sensorEdgePolarity,
    on: row.on,
    toggle: row.toggle,
    toggleSession: row.toggleSession,
    brightness: row.brightness,
    colorTempKelvin: row.colorTempKelvin,
    sunsetLinkEnabled: row.sunsetLinkEnabled,
    minutesBeforeSunset: row.minutesBeforeSunset,
    sunsetLastAdjustAt: row.sunsetLastAdjustAt
      ? row.sunsetLastAdjustAt.toISOString()
      : null,
    sunsetLastAdjustResult: row.sunsetLastAdjustResult,
    lastRunAt: row.lastRunAt ? row.lastRunAt.toISOString() : null,
    lastRunResult: row.lastRunResult,
    targets: row.targets.map((t) => ({
      id: t.id,
      dirigeraDeviceId: t.dirigeraDeviceId,
    })),
  };
}

function parseAutomationWriteInput(formData: FormData) {
  const triggerRaw = String(formData.get("triggerKind") ?? "SCHEDULE").trim();
  const triggerKind =
    triggerRaw === "SENSOR_EDGE" ? ("SENSOR_EDGE" as const) : ("SCHEDULE" as const);

  const timeRaw = String(formData.get("timeLocal") ?? "").trim();
  const timeLocal = timeRaw.length >= 5 ? timeRaw.slice(0, 5) : timeRaw;

  const daysOfWeek = formData
    .getAll("daysOfWeek")
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n));

  const targetDeviceIds = formData
    .getAll("targetDeviceIds")
    .map((v) => String(v).trim())
    .filter(Boolean);

  // Prefer `action` (on|off|toggle); fall back to legacy `on` true/false.
  const actionRaw = String(formData.get("action") ?? formData.get("on") ?? "")
    .trim()
    .toLowerCase();
  const toggle = actionRaw === "toggle";
  const on =
    toggle ||
    actionRaw === "true" ||
    actionRaw === "on" ||
    actionRaw === "1";

  const brightnessRaw = String(formData.get("brightness") ?? "").trim();
  const colorTempRaw = String(formData.get("colorTempKelvin") ?? "").trim();

  const sensorDirigeraDeviceId = String(
    formData.get("sensorDirigeraDeviceId") ?? "",
  ).trim();
  const sensorEdgeAttribute = String(
    formData.get("sensorEdgeAttribute") ?? "",
  ).trim();
  const polarityRaw = String(formData.get("sensorEdgePolarity") ?? "rising")
    .trim()
    .toLowerCase();
  const sensorEdgePolarity =
    polarityRaw === "falling" ? ("falling" as const) : ("rising" as const);

  const activeFromRaw = String(formData.get("activeFromLocal") ?? "").trim();
  const activeUntilRaw = String(formData.get("activeUntilLocal") ?? "").trim();
  const activeFromLocal =
    activeFromRaw.length >= 5 ? activeFromRaw.slice(0, 5) : activeFromRaw || null;
  const activeUntilLocal =
    activeUntilRaw.length >= 5
      ? activeUntilRaw.slice(0, 5)
      : activeUntilRaw || null;

  const sunsetLinkRaw = String(formData.get("sunsetLinkEnabled") ?? "")
    .trim()
    .toLowerCase();
  const sunsetLinkEnabled =
    sunsetLinkRaw === "true" ||
    sunsetLinkRaw === "on" ||
    sunsetLinkRaw === "1";
  const minutesBeforeRaw = String(
    formData.get("minutesBeforeSunset") ?? "",
  ).trim();
  const minutesBeforeSunset =
    minutesBeforeRaw === "" ? null : Number(minutesBeforeRaw);

  if (triggerKind === "SENSOR_EDGE") {
    return {
      name: String(formData.get("name") ?? ""),
      triggerKind,
      timeLocal: null,
      daysOfWeek: [] as number[],
      activeFromLocal,
      activeUntilLocal,
      sensorDirigeraDeviceId,
      sensorEdgeAttribute: sensorEdgeAttribute || null,
      sensorEdgePolarity,
      on,
      toggle,
      brightness: brightnessRaw === "" ? null : Number(brightnessRaw),
      colorTempKelvin: colorTempRaw === "" ? null : Number(colorTempRaw),
      sunsetLinkEnabled: false,
      minutesBeforeSunset: null,
      targetDeviceIds,
    };
  }

  return {
    name: String(formData.get("name") ?? ""),
    triggerKind,
    timeLocal,
    daysOfWeek,
    activeFromLocal,
    activeUntilLocal,
    sensorDirigeraDeviceId: null,
    sensorEdgeAttribute: null,
    sensorEdgePolarity: null,
    on,
    toggle: false,
    brightness: brightnessRaw === "" ? null : Number(brightnessRaw),
    colorTempKelvin: colorTempRaw === "" ? null : Number(colorTempRaw),
    sunsetLinkEnabled,
    minutesBeforeSunset,
    targetDeviceIds,
  };
}

export async function getAutomations(): Promise<AutomationListItem[]> {
  const { householdId } = await requireHousehold();
  const result = await listAutomations(householdId);
  if (isDomainError(result)) {
    throw new Error(result.message);
  }
  return result.map(toAutomationListItem);
}

export async function getDirigeraEdgeSensors(): Promise<DirigeraEdgeSensorsResult> {
  await requireHousehold();
  if (!isDirigeraConfigured()) {
    return { configured: false, sensors: [] };
  }
  const result = await listDirigeraEdgeSensors();
  if (isDomainError(result)) {
    return { configured: true, sensors: [], error: result.message };
  }
  return { configured: true, sensors: result };
}

export async function createAutomationAction(formData: FormData) {
  const { householdId } = await requireMutationAccess(ModuleId.SMART_HOME);
  const input = parseAutomationWriteInput(formData);
  const result = await createAutomation(householdId, input);
  if (isDomainError(result)) {
    throw new Error(result.message);
  }
  revalidatePath("/smart-home");
}

export async function updateAutomationAction(formData: FormData) {
  const { householdId } = await requireMutationAccess(ModuleId.SMART_HOME);
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Automation id is required.");
  const input = parseAutomationWriteInput(formData);
  const result = await updateAutomation(householdId, id, input);
  if (isDomainError(result)) {
    throw new Error(result.message);
  }
  revalidatePath("/smart-home");
}

export async function setAutomationEnabledAction(id: string, enabled: boolean) {
  const { householdId } = await requireMutationAccess(ModuleId.SMART_HOME);
  const result = await setAutomationEnabled(householdId, id, enabled);
  if (isDomainError(result)) {
    throw new Error(result.message);
  }
  revalidatePath("/smart-home");
}

export async function deleteAutomationAction(formData: FormData) {
  const { householdId } = await requireMutationAccess(ModuleId.SMART_HOME);
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const result = await deleteAutomation(householdId, id);
  if (isDomainError(result)) {
    throw new Error(result.message);
  }
  revalidatePath("/smart-home");
}

export async function applyAutomationActionUi(id: string) {
  const { householdId } = await requireMutationAccess(ModuleId.SMART_HOME);
  const row = await getAutomation(householdId, id);
  if (isDomainError(row)) {
    return { success: false as const, error: row.message };
  }

  // Run now must not consume SENSOR_EDGE cooldown (lastRunAt).
  const result = await applyAutomationAction(householdId, id, {
    updateLastRunAt: row.triggerKind !== "SENSOR_EDGE",
  });
  if (isDomainError(result)) {
    return { success: false as const, error: result.message };
  }
  revalidatePath("/smart-home");
  return {
    success: true as const,
    lastRunResult: result.lastRunResult,
    failed: result.failed,
  };
}
