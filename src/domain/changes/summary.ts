export function buildSummary(
  entityType: string,
  payload: Record<string, unknown>,
): string {
  const input = (payload.input as Record<string, unknown> | undefined) ?? payload;

  if (entityType === "shopping_item") {
    const created = payload.created as Record<string, unknown> | undefined;
    const name =
      (created?.name as string | undefined) ??
      (input.name as string | undefined) ??
      "item";
    const quantity =
      (created?.quantity as number | undefined) ??
      (input.quantity as number | undefined) ??
      1;
    return `shopping: ${name} ×${quantity}`;
  }

  if (entityType === "inventory_update") {
    const before = payload.before as { total?: number } | undefined;
    const after = payload.after as { total?: number } | undefined;
    const productId = (input.id as string | undefined) ?? "product";
    const name = (payload.product_name as string | undefined) ?? productId;

    if (input.quantity !== undefined && input.quantity !== null) {
      return `inventory: ${name} set to ${after?.total ?? input.quantity}`;
    }

    const delta = input.delta as number | undefined;
    if (delta !== undefined && before?.total !== undefined && after?.total !== undefined) {
      return `inventory: ${name} ${before.total} → ${after.total} (delta ${delta})`;
    }

    if (before?.total !== undefined && after?.total !== undefined) {
      return `inventory: ${name} ${before.total} → ${after.total}`;
    }

    return `inventory: ${name} updated`;
  }

  return "MCP write";
}
