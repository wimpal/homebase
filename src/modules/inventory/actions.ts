"use server";

import { prisma } from "@/core/db";
import { requireHousehold } from "@/core/auth/session";
import { listInventory } from "@/domain/inventory";
import { revalidatePath } from "next/cache";

export async function getProducts() {
  const { householdId } = await requireHousehold();
  const items = await listInventory(householdId);
  const ids = items.map((item) => item.id);
  if (ids.length === 0) {
    return [];
  }
  return prisma.product.findMany({
    where: { id: { in: ids }, householdId },
    include: {
      stockItems: { include: { location: true } },
      barcodes: true,
    },
    orderBy: { name: "asc" },
  });
}

export async function createProduct(formData: FormData) {
  const { householdId } = await requireHousehold();
  const name = formData.get("name") as string;
  const category = (formData.get("category") as string) || undefined;
  const lowStockAt = parseInt((formData.get("lowStockAt") as string) || "1", 10);
  const quantity = parseInt((formData.get("quantity") as string) || "0", 10);
  const locationId = (formData.get("locationId") as string) || undefined;
  const expiryDate = formData.get("expiryDate")
    ? new Date(formData.get("expiryDate") as string)
    : undefined;
  const barcode = (formData.get("barcode") as string) || undefined;

  await prisma.product.create({
    data: {
      householdId,
      name,
      category,
      lowStockAt,
      stockItems: quantity > 0 ? {
        create: { householdId, quantity, locationId, expiryDate },
      } : undefined,
      barcodes: barcode ? { create: { code: barcode } } : undefined,
    },
  });

  revalidatePath("/inventory");
}

export async function addStock(formData: FormData) {
  const { householdId } = await requireHousehold();
  const productId = formData.get("productId") as string;
  const quantity = parseInt(formData.get("quantity") as string, 10);
  const locationId = (formData.get("locationId") as string) || undefined;
  const expiryDate = formData.get("expiryDate")
    ? new Date(formData.get("expiryDate") as string)
    : undefined;

  await prisma.stockItem.create({
    data: { householdId, productId, quantity, locationId, expiryDate },
  });
  revalidatePath("/inventory");
}

export async function createLocation(formData: FormData) {
  const { householdId } = await requireHousehold();
  const name = formData.get("name") as string;
  await prisma.location.create({ data: { householdId, name } });
  revalidatePath("/inventory");
}

export async function getLocations() {
  const { householdId } = await requireHousehold();
  return prisma.location.findMany({ where: { householdId } });
}

export async function findProductByBarcode(code: string) {
  const { householdId } = await requireHousehold();
  const barcode = await prisma.barcode.findUnique({
    where: { code },
    include: {
      product: {
        include: { stockItems: { include: { location: true } } },
      },
    },
  });
  if (!barcode || barcode.product.householdId !== householdId) return null;
  return barcode.product;
}

export async function getLowStockProducts() {
  const { householdId } = await requireHousehold();
  const lowStockIds = await listInventory(householdId, { low_stock_only: true });
  if (lowStockIds.length === 0) {
    return [];
  }
  return prisma.product.findMany({
    where: {
      householdId,
      id: { in: lowStockIds.map((item) => item.id) },
    },
    include: { stockItems: true },
    orderBy: { name: "asc" },
  });
}
