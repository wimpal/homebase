/** Stable lights.set_state error strings — keep in sync with contracts/homebase.tools.yaml. */

export const DIRIGERA_NOT_CONFIGURED = "Dirigera not configured";
export const DIRIGERA_HUB_UNREACHABLE = "Failed to reach Dirigera hub";
export const DIRIGERA_AUTH_FAILED = "Dirigera authentication failed";
export const DIRIGERA_UNKNOWN_DEVICE = "Unknown or stale device_id";
export const DIRIGERA_DEVICE_UNREACHABLE = "Device unreachable (Zigbee mesh)";

function httpStatus(err: unknown): number | undefined {
  if (typeof err !== "object" || err === null || !("response" in err)) {
    return undefined;
  }
  const status = (err as { response?: { statusCode?: unknown } }).response?.statusCode;
  return typeof status === "number" ? status : undefined;
}

export function classifyDirigeraHubError(err: unknown): string {
  const status = httpStatus(err);
  if (status === 404) return DIRIGERA_UNKNOWN_DEVICE;
  if (status === 401 || status === 403) return DIRIGERA_AUTH_FAILED;
  return DIRIGERA_HUB_UNREACHABLE;
}
