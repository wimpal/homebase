# Shopping & Inventory

Homebase treats purchasable goods as a persistent household catalog (`Product`).
The shopping list is a view of catalog items currently marked as needed—not a
throwaway list of free-text rows.

## Language

**Product**:
The canonical record for something the household buys or tracks. Shared by
inventory and shopping; a product may exist without stock rows. Names are unique
per household (case-insensitive).
_Avoid_: Item, grocery, SKU (unless barcode-specific)

**Needed**:
A product flagged for purchase. Needed items appear on the active shopping list.
Bought items are hidden from the main list (not deleted from the catalog).
_Avoid_: Want, todo, unchecked (use only for UI checkbox state)

**Shopping list slot**:
The single primary-list row tied to a product (`ShoppingItem` with `productId`).
Holds list-specific fields (quantity, store, tags) while the product holds the
canonical name. Last quantity/store/tags are remembered when re-marking as needed.
_Avoid_: List entry, line item (when referring to the persistent slot)

**Catalog**:
All household products, browsable/searchable on the shopping screen. Sorted by
recency/frequency once purchase history exists; alphabetical until then.
_Avoid_: Database, master list

**Bought**:
The user completed a purchase. Clears needed, records purchase history, and
increments inventory when the product is stock-tracked.
_Avoid_: Complete, checked off (UI label only)

**Auto-add**:
When inventory drops below threshold, automatically mark a product as needed on
the shopping list. Opt-in per product via `autoAddWhenLowStock` (default off);
configured on the product/inventory edit screen.
_Avoid_: Auto-populate (too vague)

**Purchase history**:
A log of buy events (product, date, quantity) used later for replenishment
predictions. Out of scope for v1 UI; data capture starts with the bought action.
_Avoid_: Transaction log (reserved for BudgetTracker money)
