import type { Light } from "dirigera";
import { DomainError } from "@/domain/error";
import { getDirigeraClient, isDirigeraConfigured } from "./client";
import { hueSaturationToHex, nearestIkeaColorPresetFromHs } from "./color";
import { DIRIGERA_HUB_UNREACHABLE, DIRIGERA_NOT_CONFIGURED } from "./errors";
import type { DirigeraLight } from "./types";

export function isLightDevice(device: { type: string; deviceType: string }): boolean {
  return device.type === "light" || device.deviceType === "light";
}

function canReceive(device: Light, attribute: string): boolean {
  return device.capabilities?.canReceive?.includes(attribute) ?? false;
}

function mapLight(device: Light): DirigeraLight {
  const name =
    device.attributes.customName?.trim() ||
    device.attributes.model ||
    device.id;

  const supportsBrightness = canReceive(device, "lightLevel");
  const supportsColorTemp = canReceive(device, "colorTemperature");
  const supportsColor =
    canReceive(device, "colorHue") || canReceive(device, "colorSaturation");

  const attrs = device.attributes;
  const colorMode = attrs.colorMode;

  let colorTempKelvin: number | undefined;
  let colorHex: string | undefined;
  let colorPreset: string | undefined;

  if (supportsColorTemp && attrs.colorTemperature != null && colorMode !== "color") {
    colorTempKelvin = attrs.colorTemperature;
  }
  if (
    supportsColor &&
    attrs.colorHue != null &&
    attrs.colorSaturation != null &&
    colorMode !== "temperature"
  ) {
    const nearest = nearestIkeaColorPresetFromHs(
      attrs.colorHue,
      attrs.colorSaturation,
    );
    colorHex = nearest?.hex ?? hueSaturationToHex(attrs.colorHue, attrs.colorSaturation);
    colorPreset = nearest?.id;
  }

  return {
    id: device.id,
    name,
    room: device.room?.name,
    isOn: attrs.isOn ?? false,
    lightLevel: attrs.lightLevel,
    colorTempKelvin,
    colorHex,
    colorPreset,
    colorTempMin: attrs.colorTemperatureMin,
    colorTempMax: attrs.colorTemperatureMax,
    supportsBrightness,
    supportsColorTemp,
    supportsColor,
    isReachable: device.isReachable,
  };
}

export async function listDirigeraLights(): Promise<DirigeraLight[] | DomainError> {
  if (!isDirigeraConfigured()) {
    return DomainError.unavailable(DIRIGERA_NOT_CONFIGURED);
  }

  try {
    const client = await getDirigeraClient();
    if (!client) {
      return DomainError.unavailable(DIRIGERA_NOT_CONFIGURED);
    }

    const devices = await client.devices.list();
    return devices
      .filter(isLightDevice)
      .map((device) => mapLight(device as Light));
  } catch {
    return DomainError.unavailable(DIRIGERA_HUB_UNREACHABLE);
  }
}
