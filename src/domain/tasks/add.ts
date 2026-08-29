import { prisma } from "@/core/db";
import { DomainError } from "@/domain/error";
import { addDays, endOfDay, parseISO } from "date-fns";
import { toTaskListItem } from "./map";
import { parseRecurrence } from "./recurrence";
import type { AddTaskInput, TaskListItem } from "./types";

export async function addChore(
  householdId: string,
  input: AddTaskInput,
): Promise<TaskListItem | DomainError> {
  const title = input.title.trim();
  if (!title) {
    return DomainError.invalidInput("title is required.");
  }

  let intervalDays = input.intervalDays;
  if (!intervalDays && input.recurrence?.trim()) {
    try {
      intervalDays = parseRecurrence(input.recurrence);
    } catch (err) {
      if (err instanceof DomainError) {
        return err;
      }
      throw err;
    }
  }

  let deadline = input.deadline;
  if (!deadline && input.due?.trim()) {
    deadline = endOfDay(parseISO(input.due.trim()));
  }

  const chore = await prisma.chore.create({
    data: {
      householdId,
      title,
      description: input.description,
      intervalDays,
      deadline,
      nextDue: intervalDays ? addDays(new Date(), intervalDays) : undefined,
    },
  });

  return toTaskListItem(chore);
}
