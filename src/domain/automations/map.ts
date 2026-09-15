import type { LightAutomation, LightAutomationTarget } from "@prisma/client";
import type { LightAutomationDto } from "./types";

type Row = LightAutomation & { targets: LightAutomationTarget[] };

export function mapAutomation(row: Row): LightAutomationDto {
  return {
    id: row.id,
    householdId: row.householdId,
    name: row.name,
    enabled: row.enabled,
    triggerKind: row.triggerKind,
    timeLocal: row.timeLocal,
    daysOfWeek: [...row.daysOfWeek],
    timezone: row.timezone,
    sensorDirigeraDeviceId: row.sensorDirigeraDeviceId,
    sensorEdgeAttribute: row.sensorEdgeAttribute,
    sensorEdgePolarity:
      row.triggerKind !== "SENSOR_EDGE"
        ? null
        : row.sensorEdgePolarity === "falling"
          ? "falling"
          : "rising",
    on: row.on,
    toggle: row.toggle,
    brightness: row.brightness,
    colorTempKelvin: row.colorTempKelvin,
    lastRunAt: row.lastRunAt,
    lastRunResult: row.lastRunResult,
    lastFiredSlot: row.lastFiredSlot,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    targets: row.targets.map((t) => ({
      id: t.id,
      dirigeraDeviceId: t.dirigeraDeviceId,
    })),
  };
}
