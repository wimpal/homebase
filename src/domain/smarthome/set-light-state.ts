import { z } from "zod";
import { getDirigeraClient, isDirigeraConfigured } from "./client";
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
    return { success: false, error: "Dirigera not configured" };
  }

  const input = setLightStateInput.safeParse({ deviceId, on, brightness });
  if (!input.success) {
    return { success: false, error: "Invalid input" };
  }

  const client = await getDirigeraClient();
  if (!client) {
    return { success: false, error: "Dirigera not configured" };
  }

  try {
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
  } catch {
    return { success: false, error: "Failed to reach Dirigera hub" };
  }
}
