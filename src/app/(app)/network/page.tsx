import { requireHousehold } from "@/core/auth/session";
import { requireModule } from "@/core/modules/guard";
import { ModuleId } from "@prisma/client";
import { getNetworkPageData } from "@/modules/network/actions";
import { NetworkClient } from "./NetworkClient";

export default async function NetworkPage({
  searchParams,
}: {
  searchParams: Promise<{ retired?: string }>;
}) {
  const { householdId, role } = await requireHousehold();
  await requireModule(householdId, ModuleId.HOME_NETWORK);

  const params = await searchParams;
  const includeRetired = params.retired === "1";
  const { devices, types, locations } = await getNetworkPageData(includeRetired);
  const isAdmin = role === "ADMIN";

  return (
    <NetworkClient
      devices={devices}
      types={types}
      locations={locations}
      isAdmin={isAdmin}
      includeRetired={includeRetired}
    />
  );
}
