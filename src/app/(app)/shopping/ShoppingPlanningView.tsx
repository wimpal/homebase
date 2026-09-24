"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmFormAction } from "@/components/ui/confirm-form-action";
import { FormAction } from "@/components/ui/form-action";
import { EmptyState } from "@/components/ui/empty-state";
import {
  addShoppingItem,
  createStore,
  markItemBought,
  markProductNeededAction,
  removeShoppingItem,
  deleteStore,
} from "@/modules/shopping/actions";
import { shoppingHref, type ShoppingViewProps } from "./types";

type NeededFilter = "all" | "available" | "on_list";

export function ShoppingPlanningView({
  listId,
  listName,
  catalog,
  items,
  stores,
  storeFilter,
}: ShoppingViewProps) {
  const t = useTranslations("shopping");
  const tc = useTranslations("common");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [neededFilter, setNeededFilter] = useState<NeededFilter>("all");
  const [mobileTab, setMobileTab] = useState<"need" | "browse">("browse");
  const [storeManageOpen, setStoreManageOpen] = useState(false);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of catalog) {
      if (p.category?.trim()) set.add(p.category.trim());
    }
    return [...set].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
  }, [catalog]);

  const filteredCatalog = useMemo(() => {
    const q = catalogQuery.trim().toLowerCase();
    return catalog.filter((p) => {
      if (categoryFilter && (p.category?.trim() ?? "") !== categoryFilter) {
        return false;
      }
      if (neededFilter === "available" && p.needed) return false;
      if (neededFilter === "on_list" && !p.needed) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.category?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [catalog, catalogQuery, categoryFilter, neededFilter]);

  const qTrim = catalogQuery.trim();
  const hasExact = catalog.some(
    (p) => p.name.toLowerCase() === qTrim.toLowerCase(),
  );
  const showCreateRow = qTrim.length > 0 && !hasExact;
  const filtersActive =
    !!catalogQuery.trim() || categoryFilter !== null || neededFilter !== "all";

  const storeChips = (
    <div className="flex flex-wrap items-center gap-2">
      <a
        href={shoppingHref({})}
        className={`rounded-full px-3 py-1 text-xs ${!storeFilter ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 dark:bg-zinc-800"}`}
      >
        {t("all")}
      </a>
      {stores.map((s) => (
        <a
          key={s.id}
          href={shoppingHref({ storeId: s.id })}
          className={`rounded-full px-3 py-1 text-xs ${storeFilter === s.id ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 dark:bg-zinc-800"}`}
        >
          {s.name}
        </a>
      ))}
      <button
        type="button"
        className="text-xs text-zinc-500 underline"
        onClick={() => setStoreManageOpen((o) => !o)}
      >
        {storeManageOpen ? t("hideStores") : t("stores")}
      </button>
    </div>
  );

  const needPanel = (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{listName}</h2>
        <span className="text-sm text-zinc-400">{items.length}</span>
      </div>
      {storeChips}
      {storeManageOpen && (
        <div className="mt-2 space-y-2 rounded-lg border border-dashed border-zinc-300 p-2 dark:border-zinc-700">
          <form action={createStore} className="flex gap-2">
            <Input name="name" placeholder={t("storeName")} required />
            <Button type="submit" size="sm">
              {tc("add")}
            </Button>
          </form>
          {stores.map((s) => (
            <ConfirmFormAction
              key={s.id}
              action={deleteStore}
              actionName="deleteStore"
              message={t("confirmDeleteStore")}
            >
              <input type="hidden" name="id" value={s.id} />
              <Button type="submit" variant="ghost" size="sm" className="h-7 text-xs">
                {tc("delete")} {s.name}
              </Button>
            </ConfirmFormAction>
          ))}
        </div>
      )}
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <EmptyState message={t("nothingNeeded")} />
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-2 py-2.5"
              >
                <FormAction
                  action={markItemBought}
                  actionName="markItemBought"
                  className="min-w-0 flex-1"
                >
                  <input type="hidden" name="id" value={item.id} />
                  <button
                    type="submit"
                    className="flex w-full items-center gap-3 text-left"
                    aria-label={t("markBought")}
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-zinc-300 text-xs dark:border-zinc-600" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {item.name}
                        {item.quantity !== 1 && (
                          <span className="text-zinc-400"> ×{item.quantity}</span>
                        )}
                      </span>
                      {(item.autoAdded || item.store || item.tags.length > 0) && (
                        <span className="block truncate text-xs text-zinc-400">
                          {item.autoAdded && t("autoAdded")}
                          {item.store && ` @ ${item.store.name}`}
                          {item.tags.length > 0 && ` · ${item.tags.join(", ")}`}
                        </span>
                      )}
                    </span>
                  </button>
                </FormAction>
                <ConfirmFormAction
                  action={removeShoppingItem}
                  actionName="removeShoppingItem"
                  message={t("confirmRemoveItem")}
                >
                  <input type="hidden" name="id" value={item.id} />
                  <Button type="submit" variant="ghost" size="sm" className="text-zinc-400">
                    {tc("remove")}
                  </Button>
                </ConfirmFormAction>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );

  const browsePanel = (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{t("catalog")}</h2>
        <span className="text-xs text-zinc-400">
          {filteredCatalog.length}
          {filtersActive ? ` / ${catalog.length}` : ""}
        </span>
      </div>

      <Input
        placeholder={t("searchProducts")}
        value={catalogQuery}
        onChange={(e) => setCatalogQuery(e.target.value)}
        className="mb-2"
        autoComplete="off"
      />

      <div className="mb-2 flex flex-wrap gap-1">
        {(
          [
            ["all", t("all")],
            ["available", t("notOnList")],
            ["on_list", t("onList")],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            type="button"
            size="sm"
            variant={neededFilter === key ? "default" : "outline"}
            onClick={() => setNeededFilter(key)}
          >
            {label}
          </Button>
        ))}
        {filtersActive && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setCatalogQuery("");
              setCategoryFilter(null);
              setNeededFilter("all");
            }}
          >
            {t("clearFilters")}
          </Button>
        )}
      </div>

      {categories.length > 0 && (
        <div className="mb-2 flex max-h-24 flex-wrap gap-1 overflow-y-auto">
          <Button
            type="button"
            size="sm"
            variant={categoryFilter === null ? "default" : "outline"}
            onClick={() => setCategoryFilter(null)}
          >
            {t("all")}
          </Button>
          {categories.map((cat) => (
            <Button
              key={cat}
              type="button"
              size="sm"
              variant={categoryFilter === cat ? "default" : "outline"}
              onClick={() =>
                setCategoryFilter((prev) => (prev === cat ? null : cat))
              }
            >
              {cat}
            </Button>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
          {showCreateRow && (
            <li>
              <FormAction
                action={addShoppingItem}
                actionName="addShoppingItem"
                onSuccess={() => setCatalogQuery("")}
              >
                <input type="hidden" name="listId" value={listId} />
                <input type="hidden" name="name" value={qTrim} />
                <input type="hidden" name="quantity" value="1" />
                <button
                  type="submit"
                  className="flex w-full items-center gap-2 px-2 py-2.5 text-left text-sm text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                >
                  {t("addNamed", { name: qTrim })}
                </button>
              </FormAction>
            </li>
          )}
          {filteredCatalog.length === 0 && !showCreateRow ? (
            <li className="px-2 py-4 text-sm text-zinc-500">
              {t("noProductsMatch")}
            </li>
          ) : (
            filteredCatalog.map((p) =>
              p.needed ? (
                <li
                  key={p.id}
                  className="flex items-center justify-between px-2 py-2.5 opacity-60"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm">{p.name}</p>
                    {p.category && (
                      <p className="truncate text-xs text-zinc-400">
                        {p.category}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-emerald-600">{t("onList")}</span>
                </li>
              ) : (
                <li key={p.id}>
                  <FormAction
                    action={markProductNeededAction}
                    actionName="markProductNeeded"
                  >
                    <input type="hidden" name="listId" value={listId} />
                    <input type="hidden" name="productId" value={p.id} />
                    <button
                      type="submit"
                      className="flex w-full items-center justify-between px-2 py-2.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {p.name}
                        </span>
                        {p.category && (
                          <span className="block truncate text-xs text-zinc-400">
                            {p.category}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-xs text-emerald-600">
                        {t("need")}
                      </span>
                    </button>
                  </FormAction>
                </li>
              ),
            )
          )}
        </ul>
      </div>
    </section>
  );

  return (
    <div className="flex h-[calc(100vh-10rem)] flex-col">
      <div className="mb-3 flex gap-1 rounded-lg bg-zinc-100 p-1 lg:hidden dark:bg-zinc-900">
        <button
          type="button"
          className={`flex-1 rounded-md py-2 text-sm font-medium ${mobileTab === "browse" ? "bg-white shadow dark:bg-zinc-800" : ""}`}
          onClick={() => setMobileTab("browse")}
        >
          {t("browse")}
        </button>
        <button
          type="button"
          className={`flex-1 rounded-md py-2 text-sm font-medium ${mobileTab === "need" ? "bg-white shadow dark:bg-zinc-800" : ""}`}
          onClick={() => setMobileTab("need")}
        >
          {t("needTab", { count: items.length })}
        </button>
      </div>

      <div className="hidden min-h-0 flex-1 gap-6 lg:grid lg:grid-cols-5">
        <div className="col-span-3 flex min-h-0 flex-col border-r border-zinc-200 pr-6 dark:border-zinc-800">
          {browsePanel}
        </div>
        <div className="col-span-2 flex min-h-0 flex-col">{needPanel}</div>
      </div>

      <div className="min-h-0 flex-1 lg:hidden">
        {mobileTab === "browse" ? browsePanel : needPanel}
      </div>
    </div>
  );
}
