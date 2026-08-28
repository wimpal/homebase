export interface McpChangeRow {
  change_id: string;
  tool: string;
  entity_type: string;
  entity_id: string;
  created_at: string;
  reverted_at?: string;
  summary: string;
}

export interface RevertMcpChangeResult {
  change_id: string;
  reverted_at: string;
  entity_type: string;
  entity_id: string;
}

export interface RecordMcpChangeInput {
  tool_name: string;
  entity_type: string;
  entity_id: string;
  payload: Record<string, unknown>;
}

export interface ListMcpChangesInput {
  limit?: number;
  include_reverted?: boolean;
}

export interface StockSnapshotItem {
  id: string;
  quantity: number;
}

export interface InventorySnapshot {
  product_id: string;
  total: number;
  stock_items: StockSnapshotItem[];
}
