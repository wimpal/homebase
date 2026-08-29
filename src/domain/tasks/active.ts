import { endOfDay, startOfDay, subDays } from "date-fns";

export type ChoreWithCompletions = {
  intervalDays: number | null;
  deadline: Date | null;
  nextDue: Date | null;
  completions: { completedAt: Date }[];
};

export function effectiveDue(chore: {
  deadline: Date | null;
  nextDue: Date | null;
}): Date | null {
  return chore.deadline ?? chore.nextDue ?? null;
}

function latestCompletion(
  completions: { completedAt: Date }[],
): Date | null {
  if (completions.length === 0) {
    return null;
  }
  return completions.reduce(
    (latest, c) => (c.completedAt > latest ? c.completedAt : latest),
    completions[0].completedAt,
  );
}

function completedForCurrentOccurrence(
  chore: ChoreWithCompletions,
  now: Date,
): boolean {
  const latest = latestCompletion(chore.completions);
  if (!latest) {
    return false;
  }

  const due = effectiveDue(chore);
  if (!due) {
    return latest >= startOfDay(now);
  }

  const periodStart =
    chore.intervalDays != null
      ? subDays(due, chore.intervalDays)
      : startOfDay(due);

  return latest >= periodStart;
}

/**
 * Whether a chore should appear on the active / actionable list.
 */
export function isChoreActive(chore: ChoreWithCompletions, now = new Date()): boolean {
  if (chore.intervalDays == null) {
    return chore.completions.length === 0;
  }

  if (completedForCurrentOccurrence(chore, now)) {
    return false;
  }

  const due = effectiveDue(chore);
  if (!due) {
    return true;
  }

  return due.getTime() <= endOfDay(now).getTime();
}
