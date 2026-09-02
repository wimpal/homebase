"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  addShoppingItem,
  createStore,
  markItemBought,
  markProductNeededAction,
} from "@/modules/shopping/actions";
import type { CatalogProduct } from "@/domain/shopping";

interface Store {
  id: string;
  name: string;
}

interface NeededItem {
  id: string;
  name: string;
  quantity: number;
  checked: boolean;
  autoAdded: boolean;
  tags: string[];
  store: { name: string } | null;
}

export function ShoppingClient({
  listId,
  listName,
  catalog,
  items,
  stores,
  storeFilter,
}: {
  listId: string;
  listName: string;
  catalog: CatalogProduct[];
  items: NeededItem[];
  stores: Store[];
  storeFilter?: string;
}) {
  const [catalogQuery, setCatalogQuery] = useState("");
  const [quickQuery, setQuickQuery] = useState("");

  const filteredCatalog = useMemo(() => {
    const q = catalogQuery.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.category?.toLowerCase().includes(q) ?? false),
    );
  }, [catalog, catalogQuery]);

  const typeaheadMatches = useMemo(() => {
    const q = quickQuery.trim().toLowerCase();
    if (!q) return [];
    return catalog.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8);
  }, [catalog, quickQuery]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Shopping</h1>
        <p className="text-zinc-500">Catalog and shopping list</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Catalog — desktop only */}
        <Card className="hidden lg:block lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Catalog</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="Search products..."
              value={catalogQuery}
              onChange={(e) => setCatalogQuery(e.target.value)}
            />
            <div className="max-h-[28rem] space-y-2 overflow-y-auto">
              {filteredCatalog.length === 0 ? (
                <p className="text-sm text-zinc-500">No products match.</p>
              ) : (
                filteredCatalog.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-lg border p-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      {p.category && (
                        <p className="truncate text-xs text-zinc-400">{p.category}</p>
                      )}
                    </div>
                    {p.needed ? (
                      <span className="ml-2 text-xs text-emerald-600">On list</span>
                    ) : (
                      <form action={markProductNeededAction}>
                        <input type="hidden" name="listId" value={listId} />
                        <input type="hidden" name="productId" value={p.id} />
                        <Button type="submit" size="sm" variant="outline">
                          Need
                        </Button>
                      </form>
                    )}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Quick add — mobile typeahead + desktop fallback */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Add Item</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={addShoppingItem} className="space-y-3">
              <input type="hidden" name="listId" value={listId} />
              <div>
                <Label>Item</Label>
                <Input
                  name="name"
                  required
                  value={quickQuery}
                  onChange={(e) => setQuickQuery(e.target.value)}
                  placeholder="Search or type new product..."
                  autoComplete="off"
                />
                {typeaheadMatches.length > 0 && quickQuery.trim() && (
                  <ul className="mt-1 rounded-md border bg-white dark:bg-zinc-900">
                    {typeaheadMatches.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                          onClick={() => setQuickQuery(p.name)}
                        >
                          {p.name}
                          {p.needed && (
                            <span className="ml-2 text-xs text-emerald-600">on list</span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <Label>Quantity</Label>
                <Input name="quantity" type="number" min="1" defaultValue="1" />
              </div>
              <div>
                <Label>Tags (comma-separated)</Label>
                <Input name="tags" placeholder="dairy, urgent" />
              </div>
              <div>
                <Label>Store</Label>
                <select
                  name="storeId"
                  className="flex h-10 w-full rounded-md border border-zinc-300 px-3 text-sm"
                >
                  <option value="">Any store</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit">Add to list</Button>
            </form>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Stores</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createStore} className="flex gap-2">
              <Input name="name" placeholder="Store name" required />
              <Button type="submit">Add</Button>
            </form>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href="/shopping"
                className={`rounded-full px-3 py-1 text-xs ${!storeFilter ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 dark:bg-zinc-800"}`}
              >
                All
              </a>
              {stores.map((s) => (
                <a
                  key={s.id}
                  href={`/shopping?store=${s.id}`}
                  className={`rounded-full px-3 py-1 text-xs ${storeFilter === s.id ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 dark:bg-zinc-800"}`}
                >
                  {s.name}
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{listName}</CardTitle>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="text-sm text-zinc-500">Nothing needed right now.</p>
          ) : (
            <ul className="space-y-2">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    <form action={markItemBought}>
                      <input type="hidden" name="id" value={item.id} />
                      <button type="submit" title="Mark bought">
                        <Checkbox checked={false} />
                      </button>
                    </form>
                    <div>
                      <p className="text-sm font-medium">
                        {item.name} x{item.quantity}
                      </p>
                      {item.autoAdded && (
                        <span className="text-xs text-amber-600">Auto-added</span>
                      )}
                      {item.store && (
                        <span className="text-xs text-zinc-400"> @ {item.store.name}</span>
                      )}
                      {item.tags.length > 0 && (
                        <div className="mt-1 flex gap-1">
                          {item.tags.map((t) => (
                            <span
                              key={t}
                              className="rounded bg-zinc-100 px-1.5 text-xs dark:bg-zinc-800"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
