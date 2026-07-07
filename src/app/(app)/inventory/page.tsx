import { getProducts, getLocations } from "@/modules/inventory/actions";
import { InventoryClient } from "./InventoryClient";
import { requireHousehold } from "@/core/auth/session";
import { requireModule } from "@/core/modules/guard";
import { ModuleId } from "@prisma/client";

export default async function InventoryPage() {
  const { householdId } = await requireHousehold();
  await requireModule(householdId, ModuleId.INVENTORY);
  const [products, locations] = await Promise.all([getProducts(), getLocations()]);
  return <InventoryClient products={products} locations={locations} />;
}
