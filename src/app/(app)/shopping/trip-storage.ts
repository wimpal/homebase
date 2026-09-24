/** sessionStorage helpers for trip-mode bought items (mistake-proof undo). */

import type { ShoppingNeededItem } from "./types";

function key(listId: string) {
  return `homebase.shopping.tripBought.${listId}`;
}

export function readTripBought(listId: string): ShoppingNeededItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(key(listId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ShoppingNeededItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeTripBought(listId: string, items: ShoppingNeededItem[]) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(key(listId), JSON.stringify(items));
}

export function clearTripBought(listId: string) {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(key(listId));
}

export function appendTripBought(listId: string, item: ShoppingNeededItem) {
  const current = readTripBought(listId).filter((i) => i.id !== item.id);
  writeTripBought(listId, [...current, { ...item, checked: true }]);
}

export function removeTripBought(listId: string, itemId: string) {
  writeTripBought(
    listId,
    readTripBought(listId).filter((i) => i.id !== itemId),
  );
}
