import { z } from "zod";
import { getDirigeraClient, isDirigeraConfigured } from "./client";
import {
  DIRIGERA_DEVICE_UNREACHABLE,
  DIRIGERA_NOT_CONFIGURED,
  DIRIGERA_UNKNOWN_DEVICE,
  classifyDirigeraHubError,
} from "./errors";
import { isLightDevice } from "./list-lights";
import type { DirigeraMutationResult } from "./types";

const setLightStateInput = z.object({
  deviceId: z.string().min(1),
  on: z.boolean(),
  brightness: z.number().min(0).max(100).optional(),
});

export async function setDirigeraLightState(
  deviceId: string,
  on: boolean,
  brightness?: number,
): Promise<DirigeraMutationResult> {
  if (!isDirigeraConfigured()) {
    return { success: false, error: DIRIGERA_NOT_CONFIGURED };
  }

  const input = setLightStateInput.safeParse({ deviceId, on, brightness });
  if (!input.success) {
    return { success: false, error: "Invalid input" };
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

    const attributes: { isOn: boolean; lightLevel?: number } = {
      isOn: input.data.on,
    };
    if (input.data.brightness != null) {
      attributes.lightLevel = input.data.brightness;
    }

    await client.devices.setAttributes({
      id: input.data.deviceId,
      attributes,
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: classifyDirigeraHubError(err) };
  }
}
