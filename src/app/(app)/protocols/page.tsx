import { requireHousehold } from "@/core/auth/session";
import { requireModule } from "@/core/modules/guard";
import { ModuleId } from "@prisma/client";
import { getProtocolsPageData } from "@/modules/protocols/actions";
import { ProtocolsClient } from "./ProtocolsClient";

export default async function ProtocolsPage() {
  const { householdId, role } = await requireHousehold();
  await requireModule(householdId, ModuleId.PROTOCOLS);

  const data = await getProtocolsPageData();
  const isAdmin = role === "ADMIN";

  return <ProtocolsClient {...data} isAdmin={isAdmin} />;
}
