import { prisma } from "@/core/db";
import { DomainError, type DomainResult } from "@/domain/error";
import { mapAutomation } from "./map";
import type { LightAutomationDto } from "./types";

export async function listAutomations(
  householdId: string,
): Promise<DomainResult<LightAutomationDto[]>> {
  const rows = await prisma.lightAutomation.findMany({
    where: { householdId },
    include: { targets: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  return rows.map(mapAutomation);
}

export async function getAutomation(
  householdId: string,
  id: string,
): Promise<DomainResult<LightAutomationDto>> {
  const row = await prisma.lightAutomation.findFirst({
    where: { id, householdId },
    include: { targets: true },
  });
  if (!row) {
    return DomainError.notFound(`No automation with id ${id}.`);
  }
  return mapAutomation(row);
}
