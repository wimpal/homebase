"use server";

import { prisma } from "@/core/db";
import { requireHousehold, requireMutationAccess } from "@/core/auth/session";
import { assertDevice } from "@/core/tenancy/assertHouseholdResource";
import { isDomainError } from "@/domain/error";
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
  brightness?: number,
) {
  await requireMutationAccess(ModuleId.SMART_HOME);
  const result = await setDirigeraLightState(deviceId, on, brightness);
  revalidatePath("/smart-home");
  return result;
}
