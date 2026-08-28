export interface ShoppingListItem {
  id: string;
  name: string;
  quantity: number;
  checked: boolean;
  added_at: string;
  auto_added: boolean;
  store?: string;
}

export interface ListShoppingInput {
  include_checked?: boolean;
  /** @deprecated use include_checked */
  include_done?: boolean;
}
