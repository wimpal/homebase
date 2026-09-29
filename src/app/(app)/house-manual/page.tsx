import { requireHousehold } from "@/core/auth/session";
import { requireModule } from "@/core/modules/guard";
import { getHouseManualPageData } from "@/modules/house-manual/actions";
import { ModuleId } from "@prisma/client";
import { HouseManualClient } from "./HouseManualClient";

export default async function HouseManualPage() {
  const { householdId, role } = await requireHousehold();
  await requireModule(householdId, ModuleId.HOUSE_MANUAL);
  const docs = await getHouseManualPageData();
  const isAdmin = role === "ADMIN";

  return <HouseManualClient docs={docs} isAdmin={isAdmin} />;
}
