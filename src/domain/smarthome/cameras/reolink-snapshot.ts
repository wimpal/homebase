import { spawn } from "node:child_process";
import { DomainError } from "@/domain/error";
import {
  parseReolinkCameraConfig,
  type ReolinkCameraConfig,
} from "./types";

export const CAMERA_FFMPEG_MISSING = "FFmpeg is not installed on the server";
export const CAMERA_SNAPSHOT_FAILED =
  "Could not capture camera snapshot (check RTSP, credentials, and LAN reachability)";
export const CAMERA_INVALID_CONFIG = "Invalid Reolink camera configuration";

const SNAPSHOT_TIMEOUT_MS = 12_000;

/** Common Reolink LAN paths — firmware varies (E1 Pro / others). */
const REOLINK_STREAM_PATHS = [
  "h264Preview_01_sub",
  "h264Preview_01_main",
  "Preview_01_sub",
  "Preview_01_main",
] as const;

function encodeRtspUserInfo(username: string, password: string): string {
  return `${encodeURIComponent(username)}:${encodeURIComponent(password)}`;
}

export function buildReolinkRtspUrl(
  config: ReolinkCameraConfig,
  path?: string,
): string {
  const streamPath =
    path ??
    (config.stream === "main" ? "h264Preview_01_main" : "h264Preview_01_sub");
  const auth = encodeRtspUserInfo(config.username, config.password);
  return `rtsp://${auth}@${config.host}:${config.rtspPort}/${streamPath}`;
}

/**
 * Grab a single JPEG frame from Reolink RTSP via system ffmpeg.
 * E1 Pro has no HTTP Snap CGI — RTSP is required.
 * Tries several Preview path names used across Reolink firmware.
 */
export async function fetchReolinkSnapshot(
  configInput: unknown,
): Promise<Buffer | DomainError> {
  const config = parseReolinkCameraConfig(configInput);
  if (!config) {
    return DomainError.invalidInput(CAMERA_INVALID_CONFIG);
  }

  const preferred =
    config.stream === "main" ? "h264Preview_01_main" : "h264Preview_01_sub";
  const paths = [
    preferred,
    ...REOLINK_STREAM_PATHS.filter((p) => p !== preferred),
  ];

  let lastError: DomainError = DomainError.unavailable(CAMERA_SNAPSHOT_FAILED);
  for (const path of paths) {
    const result = await runFfmpegSnapshot(buildReolinkRtspUrl(config, path));
    if (!(result instanceof DomainError)) {
      return result;
    }
    if (result.message === CAMERA_FFMPEG_MISSING) {
      return result;
    }
    lastError = result;
  }
  return lastError;
}

function runFfmpegSnapshot(rtspUrl: string): Promise<Buffer | DomainError> {
  return new Promise((resolve) => {
    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-rtsp_transport",
      "tcp",
      "-i",
      rtspUrl,
      "-frames:v",
      "1",
      "-f",
      "image2pipe",
      "-vcodec",
      "mjpeg",
      "pipe:1",
    ];

    let settled = false;
    const chunks: Buffer[] = [];

    let child;
    try {
      child = spawn("ffmpeg", args, {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch {
      settled = true;
      resolve(DomainError.unavailable(CAMERA_FFMPEG_MISSING));
      return;
    }

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      resolve(DomainError.unavailable(CAMERA_SNAPSHOT_FAILED));
    }, SNAPSHOT_TIMEOUT_MS);

    child.on("error", (err: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err.code === "ENOENT") {
        resolve(DomainError.unavailable(CAMERA_FFMPEG_MISSING));
        return;
      }
      resolve(DomainError.unavailable(CAMERA_SNAPSHOT_FAILED));
    });

    child.stdout.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    // Discard stderr — may echo the RTSP URL with credentials.
    child.stderr.on("data", () => {});

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const jpeg = Buffer.concat(chunks);
      if (code === 0 && jpeg.length > 0) {
        resolve(jpeg);
        return;
      }
      resolve(DomainError.unavailable(CAMERA_SNAPSHOT_FAILED));
    });
  });
}
