import { DomainError } from "@/domain/error";

export function parseRecurrence(value: string | undefined): number | undefined {
  if (!value?.trim()) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "weekly") {
    return 7;
  }
  if (normalized === "monthly") {
    return 30;
  }

  const everyMatch = /^every\s+(\d+)\s+days?$/i.exec(value.trim());
  if (everyMatch) {
    const days = parseInt(everyMatch[1], 10);
    if (days > 0) {
      return days;
    }
  }

  throw DomainError.invalidInput(
    'recurrence must be "weekly", "monthly", or "every N days".',
  );
}
