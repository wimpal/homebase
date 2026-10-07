"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmFormAction } from "@/components/ui/confirm-form-action";
import { FormAction } from "@/components/ui/form-action";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useFormError } from "@/components/ui/form-error-context";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  addShoppingItem,
  createStore,
  markItemBought,
  markProductNeededAction,
  removeShoppingItem,
  deleteStore,
  unmarkItemBought,
} from "@/modules/shopping/actions";
import {
  appendTripBought,
  clearTripBought,
  readTripBought,
  removeTripBought,
  writeTripBought,
} from "./trip-storage";
import {
  shoppingHref,
  type ShoppingNeededItem,
  type ShoppingViewProps,
} from "./types";

export function ShoppingTripView({
  listId,
  listName,
  catalog,
  items,
  stores,
  storeFilter,
}: ShoppingViewProps) {
  const t = useTranslations("shopping");
  const tc = useTranslations("common");
  const tu = useTranslations("ui.loading");
  const { handleActionResult } = useFormError();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [storeManageOpen, setStoreManageOpen] = useState(false);
  const [tripBought, setTripBought] = useState<ShoppingNeededItem[]>(() =>
    readTripBought(listId),
  );
  const [hydrated, setHydrated] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setTripBought(readTripBought(listId));
    setHydrated(true);
  }, [listId]);

  // Drop trip-bought entries that reappeared as needed (undo caught up).
  useEffect(() => {
    if (!hydrated) return;
    const neededIds = new Set(items.map((i) => i.id));
    setTripBought((prev) => {
      const pruned = prev.filter((i) => !neededIds.has(i.id));
      if (pruned.length !== prev.length) {
        writeTripBought(listId, pruned);
        return pruned;
      }
      return prev;
    });
  }, [items, listId, hydrated]);

  const displayItems = useMemo(() => {
    const neededIds = new Set(items.map((i) => i.id));
    const boughtOnly = tripBought.filter((i) => !neededIds.has(i.id));
    return [
      ...items.map((i) => ({ ...i, checked: false as boolean })),
      ...boughtOnly.map((i) => ({ ...i, checked: true as boolean })),
    ];
  }, [items, tripBought]);

  const boughtCount = displayItems.filter((i) => i.checked).length;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return catalog.slice(0, 40);
    return catalog
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.category?.toLowerCase().includes(q) ?? false),
      )
      .slice(0, 40);
  }, [catalog, query]);

  const qTrim = query.trim();
  const hasExact = catalog.some(
    (p) => p.name.toLowerCase() === qTrim.toLowerCase(),
  );
  const showCreate = qTrim.length > 0 && !hasExact;

  function closeAdd() {
    setOpen(false);
    setQuery("");
  }

  function refreshTripBought() {
    setTripBought(readTripBought(listId));
  }

  function setItemPending(id: string, on: boolean) {
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function buyItem(item: ShoppingNeededItem) {
    if (pendingIds.has(item.id)) return;
    // Optimistic: write before server round-trip so strike-through survives revalidate remount.
    appendTripBought(listId, item);
    refreshTripBought();
    setItemPending(item.id, true);

    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", item.id);
      const result = await markItemBought(fd);
      if (handleActionResult(result, "markItemBought")) {
        removeTripBought(listId, item.id);
        refreshTripBought();
      }
      setItemPending(item.id, false);
    });
  }

  function unbuyItem(item: ShoppingNeededItem) {
    if (pendingIds.has(item.id)) return;
    removeTripBought(listId, item.id);
    refreshTripBought();
    setItemPending(item.id, true);

    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", item.id);
      const result = await unmarkItemBought(fd);
      if (handleActionResult(result, "unmarkItemBought")) {
        appendTripBought(listId, item);
        refreshTripBought();
      }
      setItemPending(item.id, false);
    });
  }

  function finishTrip() {
    clearTripBought(listId);
    setTripBought([]);
  }

  return (
    <div className="relative mx-auto max-w-lg space-y-4 pb-28">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{listName}</h2>
          <p className="text-sm tabular-nums text-muted-foreground">
            {t("tripProgress", {
              needed: items.length,
              bought: boughtCount,
            })}
          </p>
        </div>
        {boughtCount > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={finishTrip}
          >
            {t("finishTrip")}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <a
          href={shoppingHref({ mode: "trip" })}
          className={`rounded-full px-3 py-1 text-xs ${!storeFilter ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
        >
          {t("all")}
        </a>
        {stores.map((s) => (
          <a
            key={s.id}
            href={shoppingHref({ storeId: s.id, mode: "trip" })}
            className={`rounded-full px-3 py-1 text-xs ${storeFilter === s.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
          >
            {s.name}
          </a>
        ))}
        <button
          type="button"
          className="text-xs text-muted-foreground underline"
          onClick={() => setStoreManageOpen((o) => !o)}
        >
          {storeManageOpen ? t("hideStores") : t("stores")}
        </button>
      </div>

      {storeManageOpen && (
        <div className="space-y-2 rounded-lg border border-dashed border-input p-3">
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

      {!hydrated ? (
        <div role="status" aria-label={tu("label")} className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : displayItems.length === 0 ? (
        <EmptyState
          title={t("nothingNeeded")}
          description={t("nothingNeededHint")}
        />
      ) : (
        <ul className="space-y-1">
          {displayItems.map((item) => (
            <li
              key={item.id}
              className="group flex items-center gap-1 rounded-xl px-1 py-1 hover:bg-muted"
            >
              {item.checked ? (
                <button
                  type="button"
                  disabled={pendingIds.has(item.id)}
                  onClick={() => unbuyItem(item)}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-3 text-left"
                  aria-label={t("markNeededAgain")}
                >
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-primary bg-primary text-xs text-primary-foreground"
                    aria-hidden
                  >
                    ✓
                  </span>
                  <span className="min-w-0">
                    <span className="block text-base font-medium leading-snug text-muted-foreground line-through">
                      {item.name}
                      {item.quantity !== 1 && (
                        <span className="ml-1">×{item.quantity}</span>
                      )}
                    </span>
                  </span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={pendingIds.has(item.id)}
                    onClick={() => buyItem(item)}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-3 text-left"
                    aria-label={t("markBought")}
                  >
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 group-hover:border-primary border-border"
                      aria-hidden
                    />
                    <span className="min-w-0">
                      <span className="block text-base font-medium leading-snug">
                        {item.name}
                        {item.quantity !== 1 && (
                          <span className="ml-1 text-muted-foreground">
                            ×{item.quantity}
                          </span>
                        )}
                      </span>
                      {(item.autoAdded ||
                        item.store ||
                        item.tags.length > 0) && (
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {item.autoAdded && t("autoAdded")}
                          {item.store && ` @ ${item.store.name}`}
                          {item.tags.length > 0 &&
                            ` · ${item.tags.join(", ")}`}
                        </span>
                      )}
                    </span>
                  </button>
                  <FormAction
                    action={removeShoppingItem}
                    actionName="removeShoppingItem"
                  >
                    <input type="hidden" name="id" value={item.id} />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="sm"
                      className="opacity-40 group-hover:opacity-100"
                    >
                      {tc("remove")}
                    </Button>
                  </FormAction>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 lg:right-[max(1.5rem,calc(50%-14rem))]"
        aria-label={t("addItem")}
      >
        <Plus className="h-7 w-7" />
      </button>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setQuery("");
        }}
      >
        <DialogContent className="flex max-h-[85vh] flex-col gap-3 overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("addItem")}</DialogTitle>
          </DialogHeader>
          <Input
            placeholder={t("searchOrType")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            autoComplete="off"
            className="h-11"
          />
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ul className="divide-y divide-border">
              {showCreate && (
                <li>
                  <FormAction
                    action={addShoppingItem}
                    actionName="addShoppingItem"
                    onSuccess={closeAdd}
                  >
                    <input type="hidden" name="listId" value={listId} />
                    <input type="hidden" name="name" value={qTrim} />
                    <input type="hidden" name="quantity" value="1" />
                    <button
                      type="submit"
                      className="w-full px-2 py-3 text-left text-sm font-medium text-primary hover:bg-primary/10"
                    >
                      {t("addNamed", { name: qTrim })}
                    </button>
                  </FormAction>
                </li>
              )}
              {matches.map((p) =>
                p.needed ? (
                  <li
                    key={p.id}
                    className="flex items-center justify-between px-2 py-3 opacity-50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm">{p.name}</p>
                      {p.category && (
                        <p className="truncate text-xs text-muted-foreground">
                          {p.category}
                        </p>
                      )}
                    </div>
                    <span className="text-xs">{t("onList")}</span>
                  </li>
                ) : (
                  <li key={p.id}>
                    <FormAction
                      action={markProductNeededAction}
                      actionName="markProductNeeded"
                      onSuccess={closeAdd}
                    >
                      <input type="hidden" name="listId" value={listId} />
                      <input type="hidden" name="productId" value={p.id} />
                      <button
                        type="submit"
                        className="flex w-full items-center justify-between px-2 py-3 text-left hover:bg-muted"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">
                            {p.name}
                          </span>
                          {p.category && (
                            <span className="block truncate text-xs text-muted-foreground">
                              {p.category}
                            </span>
                          )}
                        </span>
                        <span className="text-xs text-primary">
                          {t("need")}
                        </span>
                      </button>
                    </FormAction>
                  </li>
                ),
              )}
            </ul>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
