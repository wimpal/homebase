import type { Prisma } from "@prisma/client";
import {
  parseReolinkCameraConfig,
  type LegacyStreamCameraConfig,
  type ReolinkCameraConfigPublic,
} from "./types";

export type DeviceConfigPublic =
  | ReolinkCameraConfigPublic
  | LegacyStreamCameraConfig
  | Record<string, unknown>
  | null;

/**
 * Strip secrets before sending Device rows to the client.
 * Reolink password never leaves the server.
 */
export function sanitizeDeviceConfig(
  config: Prisma.JsonValue | null | undefined,
): DeviceConfigPublic {
  if (config === null || config === undefined) return null;
  if (typeof config !== "object" || Array.isArray(config)) return null;

  const reolink = parseReolinkCameraConfig(config);
  if (reolink) {
    const { password: _pw, ...rest } = reolink;
    return { ...rest, hasPassword: true };
  }

  const streamUrl =
    typeof (config as { streamUrl?: unknown }).streamUrl === "string"
      ? (config as { streamUrl: string }).streamUrl
      : undefined;
  if (streamUrl) {
    // Never send credentialed URLs (user:pass@host) to the browser.
    if (/:\/\/[^/?#]*@/.test(streamUrl)) {
      return { streamConfigured: true };
    }
    return { streamUrl };
  }

  // Unknown shape — drop anything that looks like a secret key.
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (/password|secret|token|credential/i.test(key)) continue;
    out[key] = value;
  }
  return out;
}
