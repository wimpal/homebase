import { prisma } from "@/core/db";
import { toPersonRecord } from "./map";
import type { PersonRecord } from "./types";

export async function listPeople(
  householdId: string,
): Promise<PersonRecord[]> {
  const rows = await prisma.person.findMany({
    where: { householdId },
    orderBy: [{ name: "asc" }, { familyName: "asc" }],
  });
  return rows.map(toPersonRecord);
}
