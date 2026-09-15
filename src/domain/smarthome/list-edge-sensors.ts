import type { Device } from "dirigera";
import { DomainError } from "@/domain/error";
import { getDirigeraClient, isDirigeraConfigured } from "./client";
import { DIRIGERA_HUB_UNREACHABLE, DIRIGERA_NOT_CONFIGURED } from "./errors";

export type DirigeraEdgeSensorDeviceType = "openCloseSensor" | "motionSensor";

export interface DirigeraEdgeSensor {
  id: string;
  name: string;
  room?: string;
  deviceType: DirigeraEdgeSensorDeviceType;
  /** Default rising-edge attribute for this device type. */
  edgeAttribute: "isOpen" | "isDetected";
  isReachable: boolean;
  /** Current edge value when known. */
  edgeValue: boolean | null;
}

function isEdgeDeviceType(
  deviceType: string,
): deviceType is DirigeraEdgeSensorDeviceType {
  return deviceType === "openCloseSensor" || deviceType === "motionSensor";
}

function mapEdgeSensor(device: Device): DirigeraEdgeSensor | null {
  if (!isEdgeDeviceType(device.deviceType)) return null;

  const edgeAttribute =
    device.deviceType === "openCloseSensor" ? "isOpen" : "isDetected";
  const attrs = device.attributes as {
    customName?: string;
    model?: string;
    isOpen?: boolean;
    isDetected?: boolean;
  };
  const name = attrs.customName?.trim() || attrs.model || device.id;
  const raw =
    edgeAttribute === "isOpen" ? attrs.isOpen : attrs.isDetected;
  const edgeValue = typeof raw === "boolean" ? raw : null;

  return {
    id: device.id,
    name,
    room: device.room?.name,
    deviceType: device.deviceType,
    edgeAttribute,
    isReachable: device.isReachable,
    edgeValue,
  };
}

export function isEdgeSensorDevice(device: {
  deviceType: string;
}): boolean {
  return isEdgeDeviceType(device.deviceType);
}

export async function listDirigeraEdgeSensors(): Promise<
  DirigeraEdgeSensor[] | DomainError
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
      .map(mapEdgeSensor)
      .filter((s): s is DirigeraEdgeSensor => s != null)
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return DomainError.unavailable(DIRIGERA_HUB_UNREACHABLE);
  }
}
