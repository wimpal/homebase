import type { Light } from "dirigera";
import { DomainError } from "@/domain/error";
import { getDirigeraClient, isDirigeraConfigured } from "./client";
import type { DirigeraLight } from "./types";

function isLightDevice(device: { type: string; deviceType: string }): boolean {
  return device.type === "light" || device.deviceType === "light";
}

function mapLight(device: Light): DirigeraLight {
  const name =
    device.attributes.customName?.trim() ||
    device.attributes.model ||
    device.id;

  return {
    id: device.id,
    name,
    room: device.room?.name,
    isOn: device.attributes.isOn ?? false,
    lightLevel: device.attributes.lightLevel,
    isReachable: device.isReachable,
  };
}

export async function listDirigeraLights(): Promise<DirigeraLight[] | DomainError> {
  if (!isDirigeraConfigured()) {
    return DomainError.unavailable("Dirigera not configured");
  }

  const client = await getDirigeraClient();
  if (!client) {
    return DomainError.unavailable("Dirigera not configured");
  }

  try {
    const devices = await client.devices.list();
    return devices
      .filter(isLightDevice)
      .map((device) => mapLight(device as Light));
  } catch {
    return DomainError.unavailable("Failed to reach Dirigera hub");
  }
}
