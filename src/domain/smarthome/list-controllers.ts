import type { Device } from "dirigera";
import { DomainError } from "@/domain/error";
import { getDirigeraClient, isDirigeraConfigured } from "./client";
import { DIRIGERA_HUB_UNREACHABLE, DIRIGERA_NOT_CONFIGURED } from "./errors";

/** Dirigera deviceTypes that can emit remotePressEvent (BUTTON trigger). */
const CONTROLLER_DEVICE_TYPES = new Set([
  "lightController",
  "genericSwitch",
  "blindsController",
  "shortcutController",
  "soundController",
]);

export interface DirigeraController {
  id: string;
  name: string;
  room?: string;
  deviceType: string;
  model: string | null;
  /** e.g. button 1 / button 2 when present. */
  switchLabel: string | null;
  controlMode: string | null;
  isReachable: boolean;
}

function mapController(device: Device): DirigeraController | null {
  if (
    !CONTROLLER_DEVICE_TYPES.has(device.deviceType) &&
    device.type !== "controller"
  ) {
    return null;
  }

  const attrs = device.attributes as {
    customName?: string;
    model?: string;
    switchLabel?: string;
    controlMode?: string;
  };
  const name = attrs.customName?.trim() || attrs.model || device.id;

  return {
    id: device.id,
    name,
    room: device.room?.name,
    deviceType: device.deviceType,
    model: attrs.model ?? null,
    switchLabel: attrs.switchLabel ?? null,
    controlMode: attrs.controlMode ?? null,
    isReachable: device.isReachable,
  };
}

export function isControllerDevice(device: {
  deviceType: string;
  type?: string;
}): boolean {
  return (
    CONTROLLER_DEVICE_TYPES.has(device.deviceType) ||
    device.type === "controller"
  );
}

export async function listDirigeraControllers(): Promise<
  DirigeraController[] | DomainError
> {
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
      .map(mapController)
      .filter((c): c is DirigeraController => c != null)
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return DomainError.unavailable(DIRIGERA_HUB_UNREACHABLE);
  }
}
