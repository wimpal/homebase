import { prisma } from "@/core/db";
import { DomainError } from "@/domain/error";
import { toRecipeDetail } from "./map";
import type { AddRecipeInput, RecipeDetail } from "./types";

const MAX_TITLE_LEN = 200;
const MAX_INGREDIENTS = 50;
const MAX_STEPS = 100;
const MAX_STEP_LEN = 2000;

export async function addRecipe(
  householdId: string,
  input: AddRecipeInput,
): Promise<RecipeDetail | DomainError> {
  const title = (input.title ?? "").trim();
  const steps = (input.steps ?? [])
    .map((s) => s.trim())
    .filter(Boolean);
  const ingredients = (input.ingredients ?? [])
    .map((item) => ({
      name: (item.name ?? "").trim(),
      quantity: (item.quantity ?? "").trim() || "1",
    }))
    .filter((item) => item.name);

  if (!title || steps.length === 0 || ingredients.length === 0) {
    return DomainError.invalidInput("Invalid recipe payload");
  }

  if (
    title.length > MAX_TITLE_LEN ||
    ingredients.length > MAX_INGREDIENTS ||
    steps.length > MAX_STEPS ||
    steps.some((s) => s.length > MAX_STEP_LEN)
  ) {
    return DomainError.invalidInput("Recipe too large");
  }

  const existing = await prisma.recipe.findFirst({
    where: {
      householdId,
      title: { equals: title, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (existing) {
    return DomainError.conflict("Recipe title already exists");
  }

  let servings = input.servings ?? 4;
  if (!Number.isFinite(servings) || servings < 1) {
    servings = 4;
  }
  servings = Math.floor(servings);

  const instructions = steps.join("\n");

  const recipe = await prisma.recipe.create({
    data: {
      householdId,
      title,
      instructions,
      servings,
      ingredients: {
        create: ingredients.map((item) => ({
          name: item.name,
          quantity: item.quantity,
        })),
      },
    },
    include: { ingredients: true },
  });

  // source_url accepted by callers but not stored in v1
  void input.source_url;

  return toRecipeDetail(recipe);
}
