"use server";

import { prisma } from "@/core/db";
import { requireHousehold, requireMutationAccess } from "@/core/auth/session";
import { assertShoppingList, assertStore } from "@/core/tenancy/assertHouseholdResource";
import {
  addShoppingListItem,
  listCatalogProducts,
  markProductNeeded,
  markShoppingItemBought,
} from "@/domain/shopping";
import { isDomainError } from "@/domain/error";
import { ModuleId } from "@prisma/client";
import { revalidatePath } from "next/cache";

export async function getShoppingLists() {
  const { householdId } = await requireHousehold();
  return prisma.shoppingList.findMany({
    where: { householdId },
    include: {
      items: {
        where: { checked: false },
        include: { store: true, product: true },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function getCatalog() {
  const { householdId } = await requireHousehold();
  const result = await listCatalogProducts(householdId);
  if (isDomainError(result)) {
    throw new Error(result.message);
  }
  return result;
}

export async function getStores() {
  const { householdId } = await requireHousehold();
  return prisma.store.findMany({ where: { householdId } });
}

export async function addShoppingItem(formData: FormData) {
  const { householdId } = await requireMutationAccess(ModuleId.SHOPPING);
  const listId = formData.get("listId") as string;
  const name = formData.get("name") as string;
  const quantity = parseInt((formData.get("quantity") as string) || "1", 10);
  const tags = ((formData.get("tags") as string) || "").split(",").map((t) => t.trim()).filter(Boolean);
  const storeId = (formData.get("storeId") as string) || undefined;
  await assertShoppingList(householdId, listId);
  if (storeId) await assertStore(householdId, storeId);

  const result = await addShoppingListItem(householdId, {
    name,
    quantity,
    tags,
    shopping_list_id: listId,
    store_id: storeId,
  });
  if (isDomainError(result)) {
    throw new Error(result.message);
  }
  revalidatePath("/shopping");
}

export async function markProductNeededAction(formData: FormData) {
  const { householdId } = await requireMutationAccess(ModuleId.SHOPPING);
  const productId = formData.get("productId") as string;
  const listId = formData.get("listId") as string;
  const quantity = parseInt((formData.get("quantity") as string) || "1", 10);
  await assertShoppingList(householdId, listId);

  const result = await markProductNeeded(householdId, {
    productId,
    quantity,
    shopping_list_id: listId,
  });
  if (isDomainError(result)) {
    throw new Error(result.message);
  }
  revalidatePath("/shopping");
}

export async function markItemBought(formData: FormData) {
  const { householdId } = await requireMutationAccess(ModuleId.SHOPPING);
  const id = formData.get("id") as string;
  const result = await markShoppingItemBought(householdId, {
    id,
    update_inventory: true,
    source: "manual",
  });
  if (isDomainError(result)) {
    throw new Error(result.message);
  }
  revalidatePath("/shopping");
  revalidatePath("/inventory");
}

export async function createStore(formData: FormData) {
  const { householdId } = await requireMutationAccess(ModuleId.SHOPPING);
  const name = formData.get("name") as string;
  await prisma.store.create({ data: { householdId, name } });
  revalidatePath("/shopping");
}

export async function getFilteredItems(listId: string, storeId?: string) {
  const { householdId } = await requireHousehold();
  const list = await prisma.shoppingList.findFirst({
    where: { id: listId, householdId },
    include: {
      items: {
        where: {
          checked: false,
          ...(storeId ? { storeId } : {}),
        },
        include: { store: true },
      },
    },
  });
  return list?.items ?? [];
}
