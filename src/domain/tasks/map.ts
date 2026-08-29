import type { Chore } from "@prisma/client";
import type { TaskListItem } from "./types";

export function toTaskListItem(chore: Chore): TaskListItem {
  const due =
    chore.deadline?.toISOString().slice(0, 10) ??
    chore.nextDue?.toISOString().slice(0, 10) ??
    null;

  return {
    id: chore.id,
    title: chore.title,
    assignee: null,
    due,
    recurrence: chore.intervalDays ? `every ${chore.intervalDays} days` : null,
    done: false,
  };
}
