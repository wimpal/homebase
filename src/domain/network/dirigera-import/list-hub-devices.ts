import type { Device } from "dirigera";
import { DomainError } from "@/domain/error";
import {
  getDirigeraClient,
  isDirigeraConfigured,
} from "@/domain/smarthome/client";
import {
  DIRIGERA_HUB_UNREACHABLE,
  DIRIGERA_NOT_CONFIGURED,
} from "@/domain/smarthome/errors";

/** One hub device (or the gateway itself) as imported into inventory. */
export type DirigeraHubDevice = {
  id: string;
  name: string;
  type: string;
  deviceType: string;
  model?: string;
  roomName?: string;
};

function deviceName(device: {
  id: string;
  attributes: { customName?: string; model?: string };
}): string {
  return device.attributes.customName?.trim() || device.attributes.model || device.id;
}

function mapDevice(device: Device): DirigeraHubDevice {
  const row: DirigeraHubDevice = {
    id: device.id,
    name: deviceName(device),
    type: device.type,
    deviceType: device.deviceType,
  };
  if (device.attributes.model) row.model = device.attributes.model;
  if (device.room?.name) row.roomName = device.room.name;
  return row;
}

/**
 * All Dirigera hub devices for import (lights, blinds, controllers, sensors,
 * outlets, ...). Adds the gateway row when devices.list() omits it.
 */
export async function listDirigeraHubDevices(): Promise<
  DirigeraHubDevice[] | DomainError
> {
  if (!isDirigeraConfigured()) {
    return DomainError.unavailable(
      DIRIGERA_NOT_CONFIGURED,
      "dirigera_not_configured",
    );
  }

  try {
    const client = await getDirigeraClient();
    if (!client) {
      return DomainError.unavailable(
        DIRIGERA_NOT_CONFIGURED,
        "dirigera_not_configured",
      );
    }

    const devices = await client.devices.list();
    const rows = devices.map(mapDevice);

    if (!rows.some((r) => r.type === "gateway" || r.deviceType === "gateway")) {
      try {
        const hub = await client.hub.status();
        const hubRow: DirigeraHubDevice = {
          id: hub.id,
          name: deviceName(hub),
          type: hub.type,
          deviceType: hub.deviceType,
        };
        if (hub.attributes.model) hubRow.model = hub.attributes.model;
        rows.push(hubRow);
      } catch {
        // Gateway row is best-effort - devices.list() rows still import.
      }
    }

    return rows.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return DomainError.unavailable(
      DIRIGERA_HUB_UNREACHABLE,
      "dirigera_unreachable",
    );
  }
}
