import type { CatalogProduct } from "@/domain/shopping";

export interface ShoppingStore {
  id: string;
  name: string;
}

export interface ShoppingNeededItem {
  id: string;
  name: string;
  quantity: number;
  checked: boolean;
  autoAdded: boolean;
  tags: string[];
  store: { name: string } | null;
}

export interface ShoppingViewProps {
  listId: string;
  listName: string;
  catalog: CatalogProduct[];
  items: ShoppingNeededItem[];
  stores: ShoppingStore[];
  storeFilter?: string;
}

export function shoppingHref(opts: {
  storeId?: string;
  mode?: "trip" | "shop";
}): string {
  const params = new URLSearchParams();
  if (opts.storeId) params.set("store", opts.storeId);
  if (opts.mode === "trip") params.set("mode", "trip");
  const qs = params.toString();
  return qs ? `/shopping?${qs}` : "/shopping";
}
