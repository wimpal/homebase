"use server";

import { prisma } from "@/core/db";
import { requireHousehold, requireMutationAccess } from "@/core/auth/session";
import { assertShoppingList, assertStore } from "@/core/tenancy/assertHouseholdResource";
import { ModuleId } from "@prisma/client";
import { revalidatePath } from "next/cache";

export async function getShoppingLists() {
  const { householdId } = await requireHousehold();
  return prisma.shoppingList.findMany({
    where: { householdId },
    include: {
      items: { include: { store: true, product: true }, orderBy: { createdAt: "desc" } },
    },
    orderBy: { createdAt: "asc" },
  });
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

  await prisma.shoppingItem.create({
    data: { shoppingListId: listId, name, quantity, tags, storeId },
  });
  revalidatePath("/shopping");
}

export async function toggleShoppingItem(formData: FormData) {
  const { householdId } = await requireMutationAccess(ModuleId.SHOPPING);
  const id = formData.get("id") as string;
  const checked = formData.get("checked") === "true";
  const result = await prisma.shoppingItem.updateMany({
    where: { id, shoppingList: { householdId } },
    data: { checked },
  });
  if (result.count === 0) throw new Error("Shopping item not found");
  revalidatePath("/shopping");
}

export async function createStore(formData: FormData) {
  const { householdId } = await requireMutationAccess(ModuleId.SHOPPING);
  const name = formData.get("name") as string;
  await prisma.store.create({ data: { householdId, name } });
  revalidatePath("/shopping");
}

export async function deleteShoppingItem(formData: FormData) {
  const { householdId } = await requireMutationAccess(ModuleId.SHOPPING);
  const id = formData.get("id") as string;
  const result = await prisma.shoppingItem.deleteMany({
    where: { id, shoppingList: { householdId } },
  });
  if (result.count === 0) throw new Error("Shopping item not found");
  revalidatePath("/shopping");
}

export async function getFilteredItems(listId: string, storeId?: string) {
  const { householdId } = await requireHousehold();
  const list = await prisma.shoppingList.findFirst({
    where: { id: listId, householdId },
    include: {
      items: {
        where: storeId ? { storeId } : undefined,
        include: { store: true },
      },
    },
  });
  return list?.items ?? [];
}
