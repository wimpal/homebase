import { ModuleId } from "@prisma/client";
import { prisma } from "@/core/db";
import { ALL_MODULE_IDS, MODULE_REGISTRY } from "./registry";

export async function getEnabledModules(householdId: string) {
  await ensureModuleSettings(householdId);

  const settings = await prisma.moduleSetting.findMany({
    where: { householdId },
  });

  if (settings.length === 0) {
    return MODULE_REGISTRY.filter((m) => m.defaultEnabled);
  }

  const enabledIds = new Set(
    settings.filter((s) => s.enabled).map((s) => s.moduleId),
  );

  return MODULE_REGISTRY.filter((m) => enabledIds.has(m.id));
}

export async function isModuleEnabled(householdId: string, moduleId: ModuleId) {
  await ensureModuleSettings(householdId);

  const setting = await prisma.moduleSetting.findUnique({
    where: { householdId_moduleId: { householdId, moduleId } },
  });

  if (!setting) {
    const mod = MODULE_REGISTRY.find((m) => m.id === moduleId);
    return mod?.defaultEnabled ?? false;
  }

  return setting.enabled;
}

/**
 * Ensure every known ModuleId has a ModuleSetting row.
 * Upserts missing ids with registry defaultEnabled; never overwrites existing toggles.
 */
export async function ensureModuleSettings(householdId: string) {
  const existing = await prisma.moduleSetting.findMany({
    where: { householdId },
    select: { moduleId: true },
  });
  const have = new Set(existing.map((r) => r.moduleId));
  const missing = ALL_MODULE_IDS.filter((id) => !have.has(id));
  if (missing.length === 0) return;

  await prisma.moduleSetting.createMany({
    data: missing.map((moduleId) => ({
      householdId,
      moduleId,
      enabled:
        MODULE_REGISTRY.find((m) => m.id === moduleId)?.defaultEnabled ?? true,
    })),
    skipDuplicates: true,
  });
}

/** @deprecated Prefer ensureModuleSettings — kept for create-household call sites. */
export async function initializeModuleSettings(householdId: string) {
  await ensureModuleSettings(householdId);
}

export async function toggleModule(
  householdId: string,
  moduleId: ModuleId,
  enabled: boolean,
) {
  await prisma.moduleSetting.upsert({
    where: { householdId_moduleId: { householdId, moduleId } },
    create: { householdId, moduleId, enabled },
    update: { enabled },
  });
}
