/** Stable lights.set_state error strings — keep in sync with contracts/homebase.tools.yaml. */

export const DIRIGERA_NOT_CONFIGURED = "Dirigera not configured";
export const DIRIGERA_HUB_UNREACHABLE = "Failed to reach Dirigera hub";
export const DIRIGERA_AUTH_FAILED = "Dirigera authentication failed";
export const DIRIGERA_UNKNOWN_DEVICE = "Unknown or stale device_id";
export const DIRIGERA_DEVICE_UNREACHABLE = "Device unreachable (Zigbee mesh)";

function httpStatus(err: unknown): number | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  // Got sets `response` non-enumerable on RequestError — read it directly.
  const e = err as {
    statusCode?: unknown;
    response?: { statusCode?: unknown; status?: unknown };
    code?: unknown;
    name?: unknown;
  };
  if (typeof e.statusCode === "number") return e.statusCode;
  const fromResponse = e.response?.statusCode ?? e.response?.status;
  if (typeof fromResponse === "number") return fromResponse;
  return undefined;
}

function hubReturnedHttpError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { name?: unknown; code?: unknown };
  return e.name === "DirigeraError" || e.code === "ERR_NON_2XX_3XX_RESPONSE";
}

/**
 * Classify Dirigera/got failures for device get/patch.
 * Hub 4xx (except auth) → unknown/stale — Dirigera often returns 400 for bad ids, not only 404.
 * Dirigera's got `beforeError` hook renames HTTP errors to DirigeraError when a body is present
 * (hub was reached); do not map those to "Failed to reach Dirigera hub".
 */
export function classifyDirigeraHubError(err: unknown): string {
  const status = httpStatus(err);
  if (status === 401 || status === 403) return DIRIGERA_AUTH_FAILED;
  if (status !== undefined && status >= 400 && status < 500) {
    return DIRIGERA_UNKNOWN_DEVICE;
  }
  if (status !== undefined && status >= 500) {
    return DIRIGERA_HUB_UNREACHABLE;
  }
  // Hub responded with a non-2xx body but status was not readable — still not "unreachable".
  if (hubReturnedHttpError(err)) {
    return DIRIGERA_UNKNOWN_DEVICE;
  }
  return DIRIGERA_HUB_UNREACHABLE;
}
