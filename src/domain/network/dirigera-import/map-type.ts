/** Dirigera device -> seeded Network device type slug (T-111). */

const CONTROLLER_DEVICE_TYPES = new Set([
  "lightController",
  "blindsController",
  "shortcutController",
  "soundController",
  "genericSwitch",
]);

const SENSOR_DEVICE_TYPES = new Set([
  "openCloseSensor",
  "motionSensor",
  "environmentSensor",
  "lightSensor",
  "occupancySensor",
  "waterSensor",
]);

/**
 * Map a Dirigera device (raw type + deviceType) to a seeded Network device
 * type slug. Unknown classes map to "other" and are never dropped.
 */
export function mapDirigeraToNetworkTypeSlug(device: {
  type: string;
  deviceType: string;
}): string {
  const { type, deviceType } = device;

  if (type === "light" || deviceType === "light") return "light";
  if (type === "blinds" || deviceType === "blinds") return "blind";
  if (type === "controller" || CONTROLLER_DEVICE_TYPES.has(deviceType)) {
    return "remote";
  }
  if (type === "outlet" || deviceType === "outlet") return "outlet";
  if (type === "gateway" || deviceType === "gateway") return "hub";
  if (type === "sensor" || SENSOR_DEVICE_TYPES.has(deviceType)) return "sensor";
  return "other";
}
