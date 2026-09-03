import type { Light } from "dirigera";
import { z } from "zod";
import { getDirigeraClient, isDirigeraConfigured } from "./client";
import { clampKelvin, hexToHueSaturation, parseColorHex } from "./color";
import {
  DIRIGERA_COLOUR_AND_TEMP,
  DIRIGERA_DEVICE_UNREACHABLE,
  DIRIGERA_INVALID_COLOUR_OR_TEMP,
  DIRIGERA_NO_COLOUR,
  DIRIGERA_NO_COLOR_TEMP,
  DIRIGERA_NOT_CONFIGURED,
  DIRIGERA_UNKNOWN_DEVICE,
  classifyDirigeraHubError,
} from "./errors";
import { isLightDevice } from "./list-lights";
import type { DirigeraMutationResult, SetDirigeraLightStateOptions } from "./types";

const setLightStateInput = z.object({
  deviceId: z.string().min(1),
  on: z.boolean(),
  brightness: z.number().min(0).max(100).optional(),
  colorTempKelvin: z.number().finite().optional(),
  colorHex: z.string().optional(),
});

function canReceive(device: Light, attribute: string): boolean {
  return device.capabilities?.canReceive?.includes(attribute) ?? false;
}

/**
 * Dirigera applies only the *first* key in a single attributes PATCH bag
 * (isOn+lightLevel → only isOn; lightLevel+colorTemperature → only lightLevel).
 * colorHue+colorSaturation are the exception — send as one pair.
 * Issue one patch per attribute group.
 */
export async function setDirigeraLightState(
  deviceId: string,
  on: boolean,
  brightnessOrOptions?: number | SetDirigeraLightStateOptions,
): Promise<DirigeraMutationResult> {
  const options: SetDirigeraLightStateOptions =
    typeof brightnessOrOptions === "number"
      ? { brightness: brightnessOrOptions }
      : (brightnessOrOptions ?? {});

  if (!isDirigeraConfigured()) {
    return { success: false, error: DIRIGERA_NOT_CONFIGURED };
  }

  const input = setLightStateInput.safeParse({
    deviceId,
    on,
    brightness: options.brightness,
    colorTempKelvin: options.colorTempKelvin,
    colorHex: options.colorHex,
  });
  if (!input.success) {
    return { success: false, error: "Invalid input" };
  }

  const { brightness, colorTempKelvin, colorHex } = input.data;
  if (colorTempKelvin != null && colorHex != null) {
    return { success: false, error: DIRIGERA_COLOUR_AND_TEMP };
  }
  if (colorHex != null && !parseColorHex(colorHex)) {
    return { success: false, error: DIRIGERA_INVALID_COLOUR_OR_TEMP };
  }

  try {
    const client = await getDirigeraClient();
    if (!client) {
      return { success: false, error: DIRIGERA_NOT_CONFIGURED };
    }

    const device = await client.devices.get({ id: input.data.deviceId });
    if (!isLightDevice(device)) {
      return { success: false, error: DIRIGERA_UNKNOWN_DEVICE };
    }
    if (!device.isReachable) {
      return { success: false, error: DIRIGERA_DEVICE_UNREACHABLE };
    }

    const light = device as Light;

    if (colorHex != null && !canReceive(light, "colorHue") && !canReceive(light, "colorSaturation")) {
      return { success: false, error: DIRIGERA_NO_COLOUR };
    }
    if (colorTempKelvin != null && !canReceive(light, "colorTemperature")) {
      return { success: false, error: DIRIGERA_NO_COLOR_TEMP };
    }

    const id = input.data.deviceId;
    const patch = async (attributes: Record<string, unknown>) => {
      await client.devices.setAttributes({ id, attributes });
    };

    if (light.attributes.isOn !== input.data.on) {
      await patch({ isOn: input.data.on });
    }

    if (input.data.on) {
      if (brightness != null) {
        await patch({ lightLevel: brightness });
      }
      if (colorTempKelvin != null) {
        await patch({
          colorTemperature: clampKelvin(
            colorTempKelvin,
            light.attributes.colorTemperatureMin,
            light.attributes.colorTemperatureMax,
          ),
        });
      }
      if (colorHex != null) {
        const hs = hexToHueSaturation(colorHex);
        if (!hs) {
          return { success: false, error: DIRIGERA_INVALID_COLOUR_OR_TEMP };
        }
        await patch({
          colorHue: hs.colorHue,
          colorSaturation: hs.colorSaturation,
        });
      }
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: classifyDirigeraHubError(err) };
  }
}
