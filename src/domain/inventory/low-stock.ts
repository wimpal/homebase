export interface StockItemLike {
  quantity: number;
}

export interface ProductLike {
  lowStockAt: number;
  stockItems: StockItemLike[];
}

export function totalQuantity(product: ProductLike): number {
  return product.stockItems.reduce((sum, item) => sum + item.quantity, 0);
}

export function isLowStock(product: ProductLike): boolean {
  return totalQuantity(product) <= product.lowStockAt;
}
