import { requireHousehold } from "@/core/auth/session";
import { requireModule } from "@/core/modules/guard";
import { ModuleId } from "@prisma/client";
import { getCatalog, getShoppingLists, getStores } from "@/modules/shopping/actions";
import { ShoppingClient } from "./ShoppingClient";

export default async function ShoppingPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string }>;
}) {
  const { householdId } = await requireHousehold();
  await requireModule(householdId, ModuleId.SHOPPING);
  const { store: storeFilter } = await searchParams;
  const [lists, stores, catalog] = await Promise.all([
    getShoppingLists(),
    getStores(),
    getCatalog(),
  ]);
  const list = lists[0];

  const items =
    list?.items.filter((i) => !storeFilter || i.storeId === storeFilter) ?? [];

  if (!list) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Shopping</h1>
        <p className="text-sm text-zinc-500">No shopping list found.</p>
      </div>
    );
  }

  return (
    <ShoppingClient
      listId={list.id}
      listName={list.name}
      catalog={catalog}
      items={items}
      stores={stores}
      storeFilter={storeFilter}
    />
  );
}
