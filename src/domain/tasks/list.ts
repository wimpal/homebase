import { prisma } from "@/core/db";
import { endOfDay, parseISO } from "date-fns";
import { isChoreActive, effectiveDue } from "./active";
import { toTaskListItem } from "./map";
import type { ListTasksInput, TaskListItem } from "./types";

export async function listChores(
  householdId: string,
  input: ListTasksInput = {},
): Promise<TaskListItem[]> {
  const includeInactive = input.include_done ?? false;
  const now = new Date();

  let dueBeforeEnd: Date | undefined;
  if (input.due_before?.trim()) {
    dueBeforeEnd = endOfDay(parseISO(input.due_before.trim()));
  }

  const chores = await prisma.chore.findMany({
    where: { householdId },
    include: {
      completions: {
        select: { completedAt: true },
        orderBy: { completedAt: "desc" },
      },
    },
  });

  let filtered = chores;

  if (!includeInactive) {
    filtered = filtered.filter((chore) => isChoreActive(chore, now));
  }

  if (dueBeforeEnd) {
    filtered = filtered.filter((chore) => {
      const due = effectiveDue(chore);
      return due != null && due.getTime() <= dueBeforeEnd!.getTime();
    });
  }

  return filtered
    .sort((a, b) => {
      const dueA = effectiveDue(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const dueB = effectiveDue(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return dueA - dueB || a.title.localeCompare(b.title);
    })
    .map(toTaskListItem);
}
