import { prisma } from "@/core/db";
import { endOfDay, parseISO, startOfDay } from "date-fns";
import { toTaskListItem } from "./map";
import type { ListTasksInput, TaskListItem } from "./types";

const FAR_FUTURE = new Date("9999-12-31T23:59:59.999Z");

function effectiveDue(chore: {
  deadline: Date | null;
  nextDue: Date | null;
}): Date {
  return chore.deadline ?? chore.nextDue ?? FAR_FUTURE;
}

function completedToday(
  completions: { completedAt: Date }[],
  todayStart: Date,
  todayEnd: Date,
): boolean {
  return completions.some(
    (c) => c.completedAt >= todayStart && c.completedAt <= todayEnd,
  );
}

export async function listChores(
  householdId: string,
  input: ListTasksInput = {},
): Promise<TaskListItem[]> {
  const includeDone = input.include_done ?? false;
  const todayStart = startOfDay(new Date());
  const todayEnd = endOfDay(new Date());

  let dueBeforeEnd: Date | undefined;
  if (input.due_before?.trim()) {
    dueBeforeEnd = endOfDay(parseISO(input.due_before.trim()));
  }

  const chores = await prisma.chore.findMany({
    where: { householdId },
    include: {
      completions: {
        where: {
          completedAt: { gte: todayStart, lte: todayEnd },
        },
        select: { completedAt: true },
      },
    },
  });

  let filtered = chores;

  if (!includeDone) {
    filtered = filtered.filter(
      (chore) => !completedToday(chore.completions, todayStart, todayEnd),
    );
  }

  if (dueBeforeEnd) {
    filtered = filtered.filter(
      (chore) => effectiveDue(chore).getTime() <= dueBeforeEnd!.getTime(),
    );
  }

  return filtered
    .sort(
      (a, b) =>
        effectiveDue(a).getTime() - effectiveDue(b).getTime() ||
        a.title.localeCompare(b.title),
    )
    .map(toTaskListItem);
}
