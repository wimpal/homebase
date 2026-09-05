"use server";

import { prisma } from "@/core/db";
import { requireHousehold, requireMutationAccess } from "@/core/auth/session";
import { assertBudget, assertRecipe } from "@/core/tenancy/assertHouseholdResource";
import { addRecipe } from "@/domain/recipes";
import { isDomainError } from "@/domain/error";
import { ModuleId } from "@prisma/client";
import { revalidatePath } from "next/cache";

export async function getRecipes() {
  const { householdId } = await requireHousehold();
  return prisma.recipe.findMany({
    where: { householdId },
    include: {
      ingredients: { include: { product: true } },
      timers: true,
      leftovers: true,
    },
    orderBy: { title: "asc" },
  });
}

export type RecipeFormState = { error?: string };

export async function createRecipe(formData: FormData) {
  const { householdId } = await requireMutationAccess(ModuleId.RECIPES);
  const title = (formData.get("title") as string) || "";
  const instructions = (formData.get("instructions") as string) || "";
  const servings = parseInt((formData.get("servings") as string) || "4", 10);
  const ingredientsRaw = (formData.get("ingredients") as string) || "";
  const timersRaw = (formData.get("timers") as string) || "";

  const ingredients = ingredientsRaw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [name, quantity] = line.split("|").map((s) => s.trim());
      return { name, quantity: quantity || "1" };
    });

  const steps = instructions
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const timers = timersRaw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [label, minutes] = line.split("|").map((s) => s.trim());
      return { label, minutes: parseInt(minutes, 10) || 5 };
    });

  const result = await addRecipe(householdId, {
    title,
    servings,
    ingredients,
    steps,
  });

  if (isDomainError(result)) {
    throw new Error(result.message);
  }

  if (timers.length > 0) {
    await prisma.recipeTimer.createMany({
      data: timers.map((timer) => ({
        recipeId: result.id,
        label: timer.label,
        minutes: timer.minutes,
      })),
    });
  }

  revalidatePath("/recipes");
}

export async function createRecipeWithState(
  _prev: RecipeFormState,
  formData: FormData,
): Promise<RecipeFormState> {
  try {
    await createRecipe(formData);
    return {};
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to create recipe",
    };
  }
}

export async function addLeftover(formData: FormData) {
  const { householdId } = await requireMutationAccess(ModuleId.RECIPES);
  const recipeId = (formData.get("recipeId") as string) || undefined;
  if (recipeId) await assertRecipe(householdId, recipeId);
  await prisma.leftover.create({
    data: {
      householdId,
      recipeId,
      name: formData.get("name") as string,
      servings: parseInt((formData.get("servings") as string) || "1", 10),
      expiresAt: formData.get("expiresAt")
        ? new Date(formData.get("expiresAt") as string)
        : undefined,
    },
  });
  revalidatePath("/recipes");
}

export async function getBudgets() {
  const { householdId } = await requireHousehold();
  return prisma.budget.findMany({
    where: { householdId },
    include: { expenses: true },
  });
}

export async function createBudget(formData: FormData) {
  const { householdId } = await requireMutationAccess(ModuleId.BUDGET);
  await prisma.budget.create({
    data: {
      householdId,
      name: formData.get("name") as string,
      category: formData.get("category") as string,
      amount: parseFloat(formData.get("amount") as string),
      period: (formData.get("period") as string) || "monthly",
    },
  });
  revalidatePath("/budget");
}

export async function addExpense(formData: FormData) {
  const { householdId } = await requireMutationAccess(ModuleId.BUDGET);
  const budgetId = (formData.get("budgetId") as string) || undefined;
  if (budgetId) await assertBudget(householdId, budgetId);
  await prisma.expense.create({
    data: {
      householdId,
      budgetId,
      description: formData.get("description") as string,
      amount: parseFloat(formData.get("amount") as string),
      category: (formData.get("category") as string) || undefined,
      date: formData.get("date") ? new Date(formData.get("date") as string) : new Date(),
    },
  });
  revalidatePath("/budget");
}
