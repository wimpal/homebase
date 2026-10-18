import { ModuleId } from "@prisma/client";
import { isModuleEnabled } from "@/core/modules/settings";
import { DomainError } from "@/domain/error";
import { getJellyfinConfig, type JellyfinConfig } from "./client";

export async function assertMediaReady(
  householdId: string,
): Promise<JellyfinConfig | DomainError> {
  // Config states: retryable = false, so Mimir's bridge does not call twice.
  const enabled = await isModuleEnabled(householdId, ModuleId.MEDIA);
  if (!enabled) {
    return new DomainError("unavailable", "Media module is disabled.", false, "module_disabled");
  }
  const config = getJellyfinConfig();
  if (!config) {
    return new DomainError(
      "unavailable",
      "Jellyfin is not configured in Homebase.",
      false,
      "jellyfin_not_configured",
    );
  }
  return config;
}
