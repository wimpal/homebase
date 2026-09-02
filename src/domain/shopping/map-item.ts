export function toShoppingListItem(item: {
  id: string;
  name: string;
  quantity: number;
  checked: boolean;
  createdAt: Date;
  autoAdded: boolean;
  store: { name: string } | null;
}) {
  return {
    id: item.id,
    name: item.name,
    quantity: item.quantity,
    checked: item.checked,
    added_at: item.createdAt.toISOString(),
    auto_added: item.autoAdded,
    ...(item.store ? { store: item.store.name } : {}),
  };
}
