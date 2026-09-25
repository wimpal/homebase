import { DomainError } from "@/domain/error";
import type { TvInputId, TvLaunchTarget } from "../types";

/** webOS Home launcher id (stable across recent LG sets). */
export const WEBOS_HOME_APP_ID = "com.webos.app.home";

/** LG external-input app ids used when switchInput is unavailable. */
const HDMI_APP_IDS: Record<Exclude<TvInputId, "live_tv">, string> = {
  hdmi1: "com.webos.app.hdmi1",
  hdmi2: "com.webos.app.hdmi2",
  hdmi3: "com.webos.app.hdmi3",
  hdmi4: "com.webos.app.hdmi4",
};

/** SSAP tv/switchInput inputId values. */
const SWITCH_INPUT_IDS: Record<TvInputId, string> = {
  hdmi1: "HDMI_1",
  hdmi2: "HDMI_2",
  hdmi3: "HDMI_3",
  hdmi4: "HDMI_4",
  live_tv: "LIVE_TV",
};

export function resolveLaunchAppId(
  target: TvLaunchTarget,
  jellyfinAppId: string | null | undefined,
): string | DomainError {
  if (target === "home") return WEBOS_HOME_APP_ID;
  const id = (jellyfinAppId ?? "").trim();
  if (!id) {
    return DomainError.invalidInput(
      "Jellyfin app id is not configured. Set it in Home network after pairing.",
      "jellyfin_app_id_unset",
    );
  }
  return id;
}

export function switchInputId(input: TvInputId): string {
  return SWITCH_INPUT_IDS[input];
}

export function inputLaunchAppId(input: TvInputId): string | null {
  if (input === "live_tv") return "com.webos.app.livetv";
  return HDMI_APP_IDS[input];
}

export function isTvLaunchTarget(raw: string): raw is TvLaunchTarget {
  return raw === "home" || raw === "jellyfin";
}

export function isTvInputId(raw: string): raw is TvInputId {
  return (
    raw === "hdmi1" ||
    raw === "hdmi2" ||
    raw === "hdmi3" ||
    raw === "hdmi4" ||
    raw === "live_tv"
  );
}
