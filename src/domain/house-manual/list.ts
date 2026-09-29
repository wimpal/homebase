import { prisma } from "@/core/db";
import { toHouseManualDocRecord } from "./map";
import type { HouseManualDocRecord } from "./types";

export async function listHouseManualDocs(
  householdId: string,
): Promise<HouseManualDocRecord[]> {
  const rows = await prisma.houseManualDocument.findMany({
    where: { householdId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toHouseManualDocRecord);
}
