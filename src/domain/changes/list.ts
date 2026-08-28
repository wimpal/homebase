import { prisma } from "@/core/db";
import { buildSummary } from "./summary";
import type { ListMcpChangesInput, McpChangeRow } from "./types";

export async function listMcpChanges(
  householdId: string,
  input: ListMcpChangesInput = {},
): Promise<McpChangeRow[]> {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);

  const rows = await prisma.mcpChangeLog.findMany({
    where: {
      householdId,
      ...(input.include_reverted ? {} : { revertedAt: null }),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return rows.map((row) => {
    const payload = row.payloadJson as Record<string, unknown>;
    return {
      change_id: row.id,
      tool: row.toolName,
      entity_type: row.entityType,
      entity_id: row.entityId,
      created_at: row.createdAt.toISOString(),
      ...(row.revertedAt ? { reverted_at: row.revertedAt.toISOString() } : {}),
      summary: buildSummary(row.entityType, payload),
    };
  });
}
