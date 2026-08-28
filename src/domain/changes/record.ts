import { Prisma } from "@prisma/client";
import { prisma } from "@/core/db";
import type { RecordMcpChangeInput } from "./types";

export async function recordMcpChange(
  householdId: string,
  input: RecordMcpChangeInput,
): Promise<string> {
  const row = await prisma.mcpChangeLog.create({
    data: {
      householdId,
      toolName: input.tool_name,
      entityType: input.entity_type,
      entityId: input.entity_id,
      payloadJson: input.payload as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  return row.id;
}
