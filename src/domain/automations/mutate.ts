import { prisma } from "@/core/db";
import { DomainError, isDomainError, type DomainResult } from "@/domain/error";
import { mapAutomation } from "./map";
import type { AutomationWriteInput, LightAutomationDto } from "./types";
import { validateAutomationWrite } from "./validate";

export async function createAutomation(
  householdId: string,
  input: AutomationWriteInput,
): Promise<DomainResult<LightAutomationDto>> {
  const validated = await validateAutomationWrite(input);
  if (isDomainError(validated)) {
    return validated;
  }

  const row = await prisma.lightAutomation.create({
    data: {
      householdId,
      name: validated.name,
      enabled: validated.enabled,
      triggerKind: validated.triggerKind,
      timeLocal: validated.timeLocal,
      daysOfWeek: validated.daysOfWeek,
      timezone: validated.timezone,
      sensorDirigeraDeviceId: validated.sensorDirigeraDeviceId,
      sensorEdgeAttribute: validated.sensorEdgeAttribute,
      sensorEdgePolarity: validated.sensorEdgePolarity,
      on: validated.on,
      brightness: validated.brightness,
      colorTempKelvin: validated.colorTempKelvin,
      targets: {
        create: validated.targetDeviceIds.map((dirigeraDeviceId) => ({
          dirigeraDeviceId,
        })),
      },
    },
    include: { targets: true },
  });

  return mapAutomation(row);
}

export async function updateAutomation(
  householdId: string,
  id: string,
  input: AutomationWriteInput,
): Promise<DomainResult<LightAutomationDto>> {
  const existing = await prisma.lightAutomation.findFirst({
    where: { id, householdId },
    select: { id: true, enabled: true },
  });
  if (!existing) {
    return DomainError.notFound(`No automation with id ${id}.`);
  }

  const validated = await validateAutomationWrite({
    ...input,
    enabled: input.enabled ?? existing.enabled,
  });
  if (isDomainError(validated)) {
    return validated;
  }

  const row = await prisma.$transaction(async (tx) => {
    await tx.lightAutomationTarget.deleteMany({ where: { automationId: id } });
    const updated = await tx.lightAutomation.updateMany({
      where: { id, householdId },
      data: {
        name: validated.name,
        enabled: validated.enabled,
        triggerKind: validated.triggerKind,
        timeLocal: validated.timeLocal,
        daysOfWeek: validated.daysOfWeek,
        timezone: validated.timezone,
        sensorDirigeraDeviceId: validated.sensorDirigeraDeviceId,
        sensorEdgeAttribute: validated.sensorEdgeAttribute,
        sensorEdgePolarity: validated.sensorEdgePolarity,
        on: validated.on,
        brightness: validated.brightness,
        colorTempKelvin: validated.colorTempKelvin,
      },
    });
    if (updated.count === 0) {
      return null;
    }
    await tx.lightAutomationTarget.createMany({
      data: validated.targetDeviceIds.map((dirigeraDeviceId) => ({
        automationId: id,
        dirigeraDeviceId,
      })),
    });
    return tx.lightAutomation.findFirst({
      where: { id, householdId },
      include: { targets: true },
    });
  });

  if (!row) {
    return DomainError.notFound(`No automation with id ${id}.`);
  }

  return mapAutomation(row);
}

export async function setAutomationEnabled(
  householdId: string,
  id: string,
  enabled: boolean,
): Promise<DomainResult<LightAutomationDto>> {
  const updated = await prisma.lightAutomation.updateMany({
    where: { id, householdId },
    data: { enabled },
  });
  if (updated.count === 0) {
    return DomainError.notFound(`No automation with id ${id}.`);
  }

  const row = await prisma.lightAutomation.findFirst({
    where: { id, householdId },
    include: { targets: true },
  });
  if (!row) {
    return DomainError.notFound(`No automation with id ${id}.`);
  }
  return mapAutomation(row);
}

export async function deleteAutomation(
  householdId: string,
  id: string,
): Promise<DomainResult<{ id: string }>> {
  const deleted = await prisma.lightAutomation.deleteMany({
    where: { id, householdId },
  });
  if (deleted.count === 0) {
    return DomainError.notFound(`No automation with id ${id}.`);
  }

  return { id };
}
