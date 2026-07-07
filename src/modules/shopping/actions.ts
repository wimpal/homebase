"use server";

import { prisma } from "@/core/db";
import { requireHousehold } from "@/core/auth/session";
import { revalidatePath } from "next/cache";

export async function getShoppingLists() {
  const { householdId } = await requireHousehold();
  return prisma.shoppingList.findMany({
    where: { householdId },
    include: {
      items: { include: { store: true, product: true }, orderBy: { createdAt: "desc" } },
    },
  });
}

export async function getStores() {
  const { householdId } = await requireHousehold();
  return prisma.store.findMany({ where: { householdId } });
}

export async function addShoppingItem(formData: FormData) {
  const { householdId } = await requireHousehold();
  const listId = formData.get("listId") as string;
  const name = formData.get("name") as string;
  const quantity = parseInt((formData.get("quantity") as string) || "1", 10);
  const tags = ((formData.get("tags") as string) || "").split(",").map((t) => t.trim()).filter(Boolean);
  const storeId = (formData.get("storeId") as string) || undefined;

  await prisma.shoppingItem.create({
    data: { shoppingListId: listId, name, quantity, tags, storeId },
  });
  revalidatePath("/shopping");
}

export async function toggleShoppingItem(formData: FormData) {
  const id = formData.get("id") as string;
  const checked = formData.get("checked") === "true";
  await prisma.shoppingItem.update({ where: { id }, data: { checked } });
  revalidatePath("/shopping");
}

export async function createStore(formData: FormData) {
  const { householdId } = await requireHousehold();
  const name = formData.get("name") as string;
  await prisma.store.create({ data: { householdId, name } });
  revalidatePath("/shopping");
}

export async function deleteShoppingItem(formData: FormData) {
  const id = formData.get("id") as string;
  await prisma.shoppingItem.delete({ where: { id } });
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
