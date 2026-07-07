import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { getShoppingLists, getStores, addShoppingItem, toggleShoppingItem, createStore, deleteShoppingItem } from "@/modules/shopping/actions";
import { requireHousehold } from "@/core/auth/session";
import { requireModule } from "@/core/modules/guard";
import { ModuleId } from "@prisma/client";

export default async function ShoppingPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string }>;
}) {
  const { householdId } = await requireHousehold();
  await requireModule(householdId, ModuleId.SHOPPING);
  const { store: storeFilter } = await searchParams;
  const [lists, stores] = await Promise.all([getShoppingLists(), getStores()]);
  const list = lists[0];

  const items = list?.items.filter((i) => !storeFilter || i.storeId === storeFilter) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Shopping</h1>
        <p className="text-zinc-500">Smart shopping lists</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle className="text-base">Add Item</CardTitle></CardHeader>
          <CardContent>
            {list && (
              <form action={addShoppingItem} className="space-y-3">
                <input type="hidden" name="listId" value={list.id} />
                <div><Label>Item</Label><Input name="name" required /></div>
                <div><Label>Quantity</Label><Input name="quantity" type="number" min="1" defaultValue="1" /></div>
                <div><Label>Tags (comma-separated)</Label><Input name="tags" placeholder="dairy, urgent" /></div>
                <div>
                  <Label>Store</Label>
                  <select name="storeId" className="flex h-10 w-full rounded-md border border-zinc-300 px-3 text-sm">
                    <option value="">Any store</option>
                    {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <Button type="submit">Add to list</Button>
              </form>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader><CardTitle className="text-base">Stores</CardTitle></CardHeader>
          <CardContent>
            <form action={createStore} className="flex gap-2">
              <Input name="name" placeholder="Store name" required />
              <Button type="submit">Add</Button>
            </form>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href="/shopping" className="rounded-full bg-emerald-100 px-3 py-1 text-xs text-emerald-700">All</a>
              {stores.map((s) => (
                <a key={s.id} href={`/shopping?store=${s.id}`} className="rounded-full bg-zinc-100 px-3 py-1 text-xs dark:bg-zinc-800">
                  {s.name}
                </a>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">{list?.name ?? "Shopping List"}</CardTitle>
          </CardHeader>
          <CardContent>
            {items.length === 0 ? (
              <p className="text-sm text-zinc-500">List is empty.</p>
            ) : (
              <ul className="space-y-2">
                {items.map((item) => (
                  <li key={item.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="flex items-center gap-3">
                      <form action={toggleShoppingItem}>
                        <input type="hidden" name="id" value={item.id} />
                        <input type="hidden" name="checked" value={(!item.checked).toString()} />
                        <button type="submit">
                          <Checkbox checked={item.checked} />
                        </button>
                      </form>
                      <div className={item.checked ? "line-through opacity-50" : ""}>
                        <p className="text-sm font-medium">{item.name} x{item.quantity}</p>
                        {item.autoAdded && <span className="text-xs text-amber-600">Auto-added</span>}
                        {item.store && <span className="text-xs text-zinc-400"> @ {item.store.name}</span>}
                        {item.tags.length > 0 && (
                          <div className="mt-1 flex gap-1">
                            {item.tags.map((t) => (
                              <span key={t} className="rounded bg-zinc-100 px-1.5 text-xs dark:bg-zinc-800">{t}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <form action={deleteShoppingItem}>
                      <input type="hidden" name="id" value={item.id} />
                      <Button type="submit" variant="ghost" size="sm">Remove</Button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
