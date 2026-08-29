import { prisma } from "@/core/db";
import type { ChoreHistoryItem, ListChoreHistoryInput } from "./types";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function listChoreHistory(
  householdId: string,
  input: ListChoreHistoryInput = {},
): Promise<ChoreHistoryItem[]> {
  const limit = Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

  const rows = await prisma.choreCompletion.findMany({
    where: { chore: { householdId } },
    include: {
      chore: { select: { title: true } },
      user: { select: { name: true } },
    },
    orderBy: { completedAt: "desc" },
    take: limit,
  });

  return rows.map((row) => ({
    id: row.id,
    chore_id: row.choreId,
    title: row.chore.title,
    started_at: row.startedAt?.toISOString() ?? null,
    completed_at: row.completedAt.toISOString(),
    duration_min: row.durationMin,
    completed_by: row.user?.name ?? null,
  }));
}
