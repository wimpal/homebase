import { ModuleId } from "@prisma/client";
import { prisma } from "@/core/db";
import { ALL_MODULE_IDS, MODULE_REGISTRY } from "./registry";

export async function getEnabledModules(householdId: string) {
  const settings = await prisma.moduleSetting.findMany({
    where: { householdId },
  });

  if (settings.length === 0) {
    return MODULE_REGISTRY.filter((m) => m.defaultEnabled);
  }

  const enabledIds = new Set(
    settings.filter((s) => s.enabled).map((s) => s.moduleId)
  );

  return MODULE_REGISTRY.filter((m) => enabledIds.has(m.id));
}

export async function isModuleEnabled(householdId: string, moduleId: ModuleId) {
  const setting = await prisma.moduleSetting.findUnique({
    where: { householdId_moduleId: { householdId, moduleId } },
  });

  if (!setting) {
    const mod = MODULE_REGISTRY.find((m) => m.id === moduleId);
    return mod?.defaultEnabled ?? false;
  }

  return setting.enabled;
}

export async function initializeModuleSettings(householdId: string) {
  const existing = await prisma.moduleSetting.count({ where: { householdId } });
  if (existing > 0) return;

  await prisma.moduleSetting.createMany({
    data: ALL_MODULE_IDS.map((moduleId) => ({
      householdId,
      moduleId,
      enabled: MODULE_REGISTRY.find((m) => m.id === moduleId)?.defaultEnabled ?? true,
    })),
  });
}

export async function toggleModule(
  householdId: string,
  moduleId: ModuleId,
  enabled: boolean
) {
  await prisma.moduleSetting.upsert({
    where: { householdId_moduleId: { householdId, moduleId } },
    create: { householdId, moduleId, enabled },
    update: { enabled },
  });
}
