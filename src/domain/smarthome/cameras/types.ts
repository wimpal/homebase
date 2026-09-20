import { z } from "zod";

/** Stored on Device.config for Reolink cameras (password server-side only). */
export const reolinkCameraConfigSchema = z.object({
  provider: z.literal("reolink"),
  host: z
    .string()
    .trim()
    .min(1)
    .max(253)
    .regex(
      /^[a-zA-Z0-9.-]+$/,
      "Host must be an IPv4 address or hostname (no port — RTSP uses 554)",
    ),
  username: z.string().trim().min(1).max(128),
  password: z.string().min(1).max(256),
  rtspPort: z.number().int().min(1).max(65535).default(554),
  stream: z.enum(["sub", "main"]).default("sub"),
});

export type ReolinkCameraConfig = z.infer<typeof reolinkCameraConfigSchema>;

/** Safe subset returned to the browser (no password). */
export type ReolinkCameraConfigPublic = Omit<ReolinkCameraConfig, "password"> & {
  hasPassword: true;
};

export type LegacyStreamCameraConfig =
  | { streamUrl: string }
  | { streamConfigured: true };

export function isReolinkCameraConfig(
  value: unknown,
): value is ReolinkCameraConfig {
  return reolinkCameraConfigSchema.safeParse(value).success;
}

export function parseReolinkCameraConfig(
  value: unknown,
): ReolinkCameraConfig | null {
  const parsed = reolinkCameraConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
