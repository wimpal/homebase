import { prisma } from "@/core/db";
import { assertChore } from "@/core/tenancy/assertHouseholdResource";
import { DomainError } from "@/domain/error";
import { addDays } from "date-fns";
import { toTaskListItem } from "./map";
import type { CompleteTaskInput, TaskListItem } from "./types";

export async function completeChoreDomain(
  householdId: string,
  input: CompleteTaskInput,
): Promise<TaskListItem | DomainError> {
  let chore;
  try {
    chore = await assertChore(householdId, input.id);
  } catch {
    return DomainError.notFound("Chore not found.");
  }

  await prisma.choreCompletion.create({
    data: {
      choreId: input.id,
      userId: input.userId ?? null,
      durationMin: input.durationMin,
    },
  });

  let updated = chore;
  if (chore.intervalDays) {
    updated = await prisma.chore.update({
      where: { id: input.id },
      data: { nextDue: addDays(new Date(), chore.intervalDays) },
    });
  }

  return toTaskListItem(updated);
}
