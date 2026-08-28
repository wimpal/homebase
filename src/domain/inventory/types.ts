export interface LocationQuantity {
  name: string;
  quantity: number;
}

export interface InventoryListItem {
  id: string;
  name: string;
  category: string | null;
  threshold: number;
  quantity: number;
  locations: LocationQuantity[];
}

export interface StockItemDetail {
  id: string;
  quantity: number;
  location: string | null;
  expiry_date: string | null;
  updated_at: string;
}

export interface InventoryDetail {
  id: string;
  name: string;
  category: string | null;
  threshold: number;
  quantity: number;
  locations: LocationQuantity[];
  stock_items: StockItemDetail[];
  barcodes: string[];
}

export interface ListInventoryInput {
  location?: string;
  category?: string;
  low_stock_only?: boolean;
}
