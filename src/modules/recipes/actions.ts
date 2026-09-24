"use server";

import { prisma } from "@/core/db";
import { requireHousehold, requireMutationAccess } from "@/core/auth/session";
import {
  assertBudget,
  assertRecipe,
} from "@/core/tenancy/assertHouseholdResource";
import {
  deleteUploadByUrl,
  saveUpload,
} from "@/core/uploads/service";
import {
  addRecipe,
  addRecipeIngredientsToShopping,
  parseTimerLines,
  updateRecipe,
  type AddRecipeToShoppingResult,
} from "@/domain/recipes";
import { isDomainError } from "@/domain/error";
import {
  type ActionResult,
  failResult,
  fromDomainError,
  okResult,
} from "@/lib/action-result";
import { ModuleId } from "@prisma/client";
import { revalidatePath } from "next/cache";

export async function getRecipes() {
  const { householdId } = await requireHousehold();
  return prisma.recipe.findMany({
    where: { householdId },
    include: {
      ingredients: { include: { product: true } },
      steps: { orderBy: { sortOrder: "asc" } },
      timers: true,
      leftovers: true,
    },
    orderBy: { title: "asc" },
  });
}

function parseIngredientLine(line: string, forceOptional?: boolean) {
  const parts = line.split("|").map((s) => s.trim());
  const name = parts[0] ?? "";
  const quantity = parts[1] || "1";
  const group = parts[2] || undefined;
  const optionalFlag = parts[3] ?? "";
  const optional =
    forceOptional === true
      ? true
      : optionalFlag === "1" || optionalFlag === "true";
  return {
    name,
    quantity,
    group: group || undefined,
    optional,
  };
}

function parseRecipeForm(formData: FormData) {
  const title = (formData.get("title") as string) || "";
  const instructions = (formData.get("instructions") as string) || "";
  const servings = parseInt((formData.get("servings") as string) || "4", 10);
  const ingredientsRaw = (formData.get("ingredients") as string) || "";
  const optionalIngredientsRaw =
    (formData.get("optionalIngredients") as string) || "";
  const tagsRaw = (formData.get("tags") as string) || "";
  const timersRaw = (formData.get("timers") as string) || "";
  const thumbnailUrlRaw = formData.get("thumbnailUrl");
  const thumbnailUrl =
    thumbnailUrlRaw === null
      ? undefined
      : String(thumbnailUrlRaw).trim() || undefined;

  const caloriesRaw = (formData.get("calories") as string)?.trim() ?? "";
  const proteinRaw = (formData.get("protein_g") as string)?.trim() ?? "";
  const carbsRaw = (formData.get("carbs_g") as string)?.trim() ?? "";
  const fatRaw = (formData.get("fat_g") as string)?.trim() ?? "";

  const mainIngredients = ingredientsRaw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => parseIngredientLine(line, false))
    .filter((item) => item.name)
    .map((item) => ({ ...item, optional: false }));

  const optionalIngredients = optionalIngredientsRaw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => parseIngredientLine(line, true))
    .filter((item) => item.name);

  const ingredients = [...mainIngredients, ...optionalIngredients];

  const steps: string[] = [];
  const stepOptional: boolean[] = [];
  for (const line of instructions.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const pipe = trimmed.lastIndexOf("|");
    if (pipe > 0) {
      const flag = trimmed.slice(pipe + 1).trim();
      if (flag === "1" || flag === "0" || flag === "true" || flag === "false") {
        steps.push(trimmed.slice(0, pipe).trim());
        stepOptional.push(flag === "1" || flag === "true");
        continue;
      }
    }
    steps.push(trimmed);
    stepOptional.push(false);
  }

  const tags = tagsRaw
    .split(/[,;\n]/)
    .map((tag) => tag.trim())
    .filter(Boolean);

  const parseNum = (raw: string): number | undefined => {
    if (!raw) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : Number.NaN;
  };

  return {
    title,
    servings,
    ingredients,
    steps,
    step_optional: stepOptional,
    tags,
    calories: parseNum(caloriesRaw),
    protein_g: parseNum(proteinRaw),
    carbs_g: parseNum(carbsRaw),
    fat_g: parseNum(fatRaw),
    thumbnail_url: thumbnailUrl,
    timersRaw,
  };
}

async function saveRecipeTimers(
  recipeId: string,
  timers: { label: string; minutes: number }[],
) {
  await prisma.recipeTimer.deleteMany({ where: { recipeId } });
  if (timers.length === 0) return;
  await prisma.recipeTimer.createMany({
    data: timers.map((timer) => ({
      recipeId,
      label: timer.label,
      minutes: timer.minutes,
    })),
  });
}

function invalidRecipePayload(message = "Invalid recipe payload"): ActionResult<never> {
  return failResult(message, "invalid_payload");
}

export async function createRecipe(formData: FormData): Promise<ActionResult> {
  const { householdId } = await requireMutationAccess(ModuleId.RECIPES);
  const parsed = parseRecipeForm(formData);

  if (
    (parsed.calories !== undefined && Number.isNaN(parsed.calories)) ||
    (parsed.protein_g !== undefined && Number.isNaN(parsed.protein_g)) ||
    (parsed.carbs_g !== undefined && Number.isNaN(parsed.carbs_g)) ||
    (parsed.fat_g !== undefined && Number.isNaN(parsed.fat_g))
  ) {
    return invalidRecipePayload();
  }

  const timers = parseTimerLines(parsed.timersRaw);
  if (isDomainError(timers)) {
    return fromDomainError(timers);
  }

  if (parsed.ingredients.length === 0) {
    return failResult("Invalid recipe payload", "empty_ingredients");
  }

  const result = await addRecipe(householdId, {
    title: parsed.title,
    servings: parsed.servings,
    ingredients: parsed.ingredients,
    steps: parsed.steps,
    step_optional: parsed.step_optional,
    tags: parsed.tags,
    calories: parsed.calories,
    protein_g: parsed.protein_g,
    carbs_g: parsed.carbs_g,
    fat_g: parsed.fat_g,
    thumbnail_url: parsed.thumbnail_url,
  });

  if (isDomainError(result)) {
    return fromDomainError(result);
  }

  await saveRecipeTimers(result.id, timers);
  revalidatePath("/recipes");
  return okResult();
}

export async function updateRecipeAction(formData: FormData): Promise<ActionResult> {
  const { householdId } = await requireMutationAccess(ModuleId.RECIPES);
  const id = (formData.get("id") as string) || "";
  if (!id) return invalidRecipePayload();
  await assertRecipe(householdId, id);

  const parsed = parseRecipeForm(formData);
  if (
    (parsed.calories !== undefined && Number.isNaN(parsed.calories)) ||
    (parsed.protein_g !== undefined && Number.isNaN(parsed.protein_g)) ||
    (parsed.carbs_g !== undefined && Number.isNaN(parsed.carbs_g)) ||
    (parsed.fat_g !== undefined && Number.isNaN(parsed.fat_g))
  ) {
    return invalidRecipePayload();
  }

  const timers = parseTimerLines(parsed.timersRaw);
  if (isDomainError(timers)) {
    return fromDomainError(timers);
  }

  if (parsed.ingredients.length === 0) {
    return failResult("Invalid recipe payload", "empty_ingredients");
  }

  const result = await updateRecipe(householdId, {
    id,
    title: parsed.title,
    servings: parsed.servings,
    ingredients: parsed.ingredients,
    steps: parsed.steps,
    step_optional: parsed.step_optional,
    tags: parsed.tags,
    calories: parsed.calories,
    protein_g: parsed.protein_g,
    carbs_g: parsed.carbs_g,
    fat_g: parsed.fat_g,
    thumbnail_url: parsed.thumbnail_url ?? null,
    timers,
  });

  if (isDomainError(result)) {
    return fromDomainError(result);
  }

  revalidatePath("/recipes");
  return okResult();
}

export async function uploadRecipeThumbnail(
  formData: FormData,
): Promise<ActionResult<{ url: string }>> {
  const { householdId } = await requireMutationAccess(ModuleId.RECIPES);
  const id = (formData.get("id") as string) || "";
  const file = formData.get("file");
  if (!id || !(file instanceof File) || file.size === 0) {
    return failResult("Invalid recipe payload", "file_required");
  }
  await assertRecipe(householdId, id);

  const existing = await prisma.recipe.findFirst({
    where: { id, householdId },
    select: { thumbnailUrl: true },
  });

  const saved = await saveUpload(file, {
    householdId,
    subdir: "recipes",
  });
  await prisma.recipe.update({
    where: { id },
    data: { thumbnailUrl: saved.url },
  });
  if (existing?.thumbnailUrl && existing.thumbnailUrl !== saved.url) {
    await deleteUploadByUrl(existing.thumbnailUrl);
  }
  revalidatePath("/recipes");
  return okResult({ url: saved.url });
}

export async function clearRecipeThumbnail(
  recipeId: string,
): Promise<ActionResult> {
  const { householdId } = await requireMutationAccess(ModuleId.RECIPES);
  if (!recipeId) return invalidRecipePayload();
  await assertRecipe(householdId, recipeId);

  const existing = await prisma.recipe.findFirst({
    where: { id: recipeId, householdId },
    select: { thumbnailUrl: true },
  });
  if (!existing) {
    return failResult("Recipe not found", "invalid_payload");
  }

  await prisma.recipe.update({
    where: { id: recipeId },
    data: { thumbnailUrl: null },
  });
  if (existing.thumbnailUrl) {
    await deleteUploadByUrl(existing.thumbnailUrl);
  }
  revalidatePath("/recipes");
  return okResult();
}

export async function addRecipeToShoppingAction(
  recipeId: string,
  includeOptional: boolean,
): Promise<ActionResult<AddRecipeToShoppingResult>> {
  const { householdId } = await requireMutationAccess(ModuleId.RECIPES);
  await assertRecipe(householdId, recipeId);
  const result = await addRecipeIngredientsToShopping(
    householdId,
    recipeId,
    includeOptional,
  );
  if (isDomainError(result)) {
    return fromDomainError(result);
  }
  revalidatePath("/shopping");
  revalidatePath("/recipes");
  return okResult(result);
}

export async function deleteRecipe(formData: FormData) {
  const { householdId } = await requireMutationAccess(ModuleId.RECIPES);
  const id = formData.get("id") as string;
  if (!id) return;
  await assertRecipe(householdId, id);
  const recipe = await prisma.recipe.findFirst({
    where: { id, householdId },
    select: { thumbnailUrl: true },
  });
  await prisma.leftover.deleteMany({ where: { householdId, recipeId: id } });
  await prisma.recipe.delete({ where: { id } });
  if (recipe?.thumbnailUrl) {
    await deleteUploadByUrl(recipe.thumbnailUrl);
  }
  revalidatePath("/recipes");
}

export async function getLeftovers() {
  const { householdId } = await requireHousehold();
  return prisma.leftover.findMany({
    where: { householdId },
    orderBy: { frozenAt: "desc" },
  });
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

export async function deleteLeftover(formData: FormData): Promise<ActionResult> {
  const { householdId } = await requireMutationAccess(ModuleId.RECIPES);
  const id = formData.get("id") as string;
  if (!id) return okResult();
  const result = await prisma.leftover.deleteMany({
    where: { id, householdId },
  });
  if (result.count === 0) {
    return failResult("Leftover not found", "leftover_not_found");
  }
  revalidatePath("/recipes");
  return okResult();
}

export async function getBudgets() {
  const { householdId } = await requireHousehold();
  return prisma.budget.findMany({
    where: { householdId },
    include: { expenses: true },
  });
}

export async function getExpenses() {
  const { householdId } = await requireHousehold();
  return prisma.expense.findMany({
    where: { householdId },
    include: { budget: true },
    orderBy: { date: "desc" },
    take: 50,
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
      date: formData.get("date")
        ? new Date(formData.get("date") as string)
        : new Date(),
    },
  });
  revalidatePath("/budget");
}

export async function deleteBudget(formData: FormData) {
  const { householdId } = await requireMutationAccess(ModuleId.BUDGET);
  const id = formData.get("id") as string;
  if (!id) return;
  await assertBudget(householdId, id);
  await prisma.budget.delete({ where: { id } });
  revalidatePath("/budget");
}

export async function deleteExpense(formData: FormData) {
  const { householdId } = await requireMutationAccess(ModuleId.BUDGET);
  const id = formData.get("id") as string;
  if (!id) return;
  const result = await prisma.expense.deleteMany({
    where: { id, householdId },
  });
  if (result.count === 0) throw new Error("Expense not found");
  revalidatePath("/budget");
}
