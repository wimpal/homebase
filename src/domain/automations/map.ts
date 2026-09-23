import type { LightAutomation, LightAutomationTarget } from "@prisma/client";
import { normalizeToggleSession, type LightAutomationDto } from "./types";

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
    activeFromLocal: row.activeFromLocal,
    activeUntilLocal: row.activeUntilLocal,
    sensorDirigeraDeviceId: row.sensorDirigeraDeviceId,
    sensorEdgeAttribute: row.sensorEdgeAttribute,
    sensorEdgePolarity:
      row.triggerKind !== "SENSOR_EDGE"
        ? null
        : row.sensorEdgePolarity === "falling"
          ? "falling"
          : "rising",
    buttonDirigeraDeviceId: row.buttonDirigeraDeviceId,
    buttonIdentity: row.buttonIdentity,
    on: row.on,
    toggle: row.toggle,
    toggleSession: normalizeToggleSession(row.toggleSession),
    brightness: row.brightness,
    colorTempKelvin: row.colorTempKelvin,
    sunsetLinkEnabled: row.sunsetLinkEnabled,
    minutesBeforeSunset: row.minutesBeforeSunset,
    sunsetLastAdjustAt: row.sunsetLastAdjustAt,
    sunsetLastAdjustResult: row.sunsetLastAdjustResult,
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
