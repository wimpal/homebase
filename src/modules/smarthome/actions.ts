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
  listAutomations,
  setAutomationEnabled,
  updateAutomation,
} from "@/domain/automations";
import {
  isDirigeraConfigured,
  listDirigeraLights,
  setDirigeraLightState,
} from "@/domain/smarthome";
import type { DirigeraLight } from "@/domain/smarthome";
import { ModuleId } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export async function getDevices() {
  const { householdId } = await requireHousehold();
  return prisma.device.findMany({ where: { householdId } });
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

export async function deleteDevice(formData: FormData) {
  const { householdId } = await requireMutationAccess(ModuleId.SMART_HOME);
  const id = formData.get("id") as string;
  if (!id) return;
  await assertDevice(householdId, id);
  await prisma.device.delete({ where: { id } });
  revalidatePath("/smart-home");
}

export async function controlHueLight(deviceId: string, on: boolean, brightness?: number) {
  const { householdId } = await requireMutationAccess(ModuleId.SMART_HOME);
  const input = z.object({
    deviceId: z.string().min(1),
    on: z.boolean(),
    brightness: z.number().min(0).max(100).optional(),
  }).parse({ deviceId, on, brightness });
  const device = await assertDevice(householdId, input.deviceId);
  if (device.type !== "LIGHT") return { success: false, error: "Device not found" };

  const bridgeIp = process.env.HUE_BRIDGE_IP;
  const username = process.env.HUE_USERNAME;
  const config = device.config as { lightId?: number } | null;

  if (!bridgeIp || !username || !config?.lightId) {
    return { success: false, error: "Hue not configured" };
  }

  try {
    const body: Record<string, unknown> = { on: input.on };
    if (input.brightness != null) body.bri = Math.round((input.brightness / 100) * 254);

    const res = await fetch(
      `http://${bridgeIp}/api/${username}/lights/${config.lightId}/state`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    return { success: res.ok };
  } catch {
    return { success: false, error: "Failed to reach Hue bridge" };
  }
}

export async function getCameraStreamUrl(deviceId: string) {
  const { householdId } = await requireHousehold();
  const device = await prisma.device.findFirst({ where: { id: deviceId, householdId } });
  if (!device || device.type !== "CAMERA") return null;
  const config = device.config as { streamUrl?: string } | null;
  return config?.streamUrl ?? null;
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

/** Serializable automation row for the Smart Home UI (T-065). */
export type AutomationListItem = {
  id: string;
  name: string;
  enabled: boolean;
  timeLocal: string;
  daysOfWeek: number[];
  on: boolean;
  brightness: number | null;
  colorTempKelvin: number | null;
  lastRunAt: string | null;
  lastRunResult: string | null;
  targets: { id: string; dirigeraDeviceId: string }[];
};

function toAutomationListItem(row: LightAutomationDto): AutomationListItem {
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    timeLocal: row.timeLocal,
    daysOfWeek: row.daysOfWeek,
    on: row.on,
    brightness: row.brightness,
    colorTempKelvin: row.colorTempKelvin,
    lastRunAt: row.lastRunAt ? row.lastRunAt.toISOString() : null,
    lastRunResult: row.lastRunResult,
    targets: row.targets.map((t) => ({
      id: t.id,
      dirigeraDeviceId: t.dirigeraDeviceId,
    })),
  };
}

function parseAutomationWriteInput(formData: FormData) {
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

  const onRaw = String(formData.get("on") ?? "");
  const on = onRaw === "true" || onRaw === "on" || onRaw === "1";

  const brightnessRaw = String(formData.get("brightness") ?? "").trim();
  const colorTempRaw = String(formData.get("colorTempKelvin") ?? "").trim();

  return {
    name: String(formData.get("name") ?? ""),
    timeLocal,
    daysOfWeek,
    on,
    brightness: brightnessRaw === "" ? null : Number(brightnessRaw),
    colorTempKelvin: colorTempRaw === "" ? null : Number(colorTempRaw),
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
  const result = await applyAutomationAction(householdId, id);
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
