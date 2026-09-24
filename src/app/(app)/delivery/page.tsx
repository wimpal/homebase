import { getDeliveries } from "@/modules/social/actions";
import { requireHousehold } from "@/core/auth/session";
import { requireModule } from "@/core/modules/guard";
import { ModuleId } from "@prisma/client";
import { DeliveryClient } from "./DeliveryClient";

export default async function DeliveryPage() {
  const { householdId } = await requireHousehold();
  await requireModule(householdId, ModuleId.DELIVERY);
  const deliveries = await getDeliveries();
  return <DeliveryClient deliveries={deliveries} />;
}
