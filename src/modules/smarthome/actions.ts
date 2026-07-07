"use server";

import { prisma } from "@/core/db";
import { requireHousehold } from "@/core/auth/session";
import { revalidatePath } from "next/cache";

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
  const { householdId } = await requireHousehold();
  await prisma.sensorReading.create({
    data: {
      householdId,
      deviceId: (formData.get("deviceId") as string) || undefined,
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
  const { householdId } = await requireHousehold();
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
  const device = await prisma.device.findUnique({ where: { id: deviceId } });
  if (!device || device.type !== "LIGHT") return { success: false, error: "Device not found" };

  const bridgeIp = process.env.HUE_BRIDGE_IP;
  const username = process.env.HUE_USERNAME;
  const config = device.config as { lightId?: number } | null;

  if (!bridgeIp || !username || !config?.lightId) {
    return { success: false, error: "Hue not configured" };
  }

  try {
    const body: Record<string, unknown> = { on };
    if (brightness != null) body.bri = Math.round((brightness / 100) * 254);

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
  const device = await prisma.device.findUnique({ where: { id: deviceId } });
  if (!device || device.type !== "CAMERA") return null;
  const config = device.config as { streamUrl?: string } | null;
  return config?.streamUrl ?? null;
}
