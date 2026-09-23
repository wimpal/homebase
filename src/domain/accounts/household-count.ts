import { prisma } from "@/core/db";
import type { HouseholdCountMode } from "./types";

export async function getHouseholdCountMode(): Promise<{
  count: number;
  mode: HouseholdCountMode;
}> {
  const count = await prisma.household.count();
  if (count === 0) return { count, mode: "zero" };
  if (count === 1) return { count, mode: "one" };
  return { count, mode: "many" };
}
