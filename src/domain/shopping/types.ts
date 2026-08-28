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

export interface AddShoppingItemInput {
  name: string;
  quantity?: number;
  /** Accepted per MCP contract; no column in schema — ignored. */
  unit?: string;
  /** UI override; MCP uses primary list via resolvePrimaryListId. */
  shopping_list_id?: string;
  tags?: string[];
  store_id?: string;
  /** When set, append an MCP audit row and return change_id. */
  mcp_audit?: { tool_name: string };
}

export type ShoppingListItemWithChange = ShoppingListItem & {
  change_id?: string;
};
