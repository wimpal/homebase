import type { Prisma } from "@prisma/client";

/** Hold a transaction-scoped advisory lock for one-Household-per-install. */
export async function acquireHouseholdSingletonLock(
  tx: Prisma.TransactionClient,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('homebase_household_singleton'))`;
}
