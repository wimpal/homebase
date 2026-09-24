import { prisma } from "@/core/db";
import { DomainError } from "@/domain/error";
import { toRecipeDetail } from "./map";
import type { RecipeDetail, UpdateRecipeInput } from "./types";
import { normalizeRecipeInput, normalizeTimers } from "./validate";

export async function updateRecipe(
  householdId: string,
  input: UpdateRecipeInput,
): Promise<RecipeDetail | DomainError> {
  const id = (input.id ?? "").trim();
  if (!id) {
    return DomainError.invalidInput("Invalid recipe payload", "invalid_payload");
  }

  const normalized = normalizeRecipeInput(input);
  if (normalized instanceof DomainError) return normalized;

  const timers =
    input.timers !== undefined
      ? normalizeTimers(input.timers)
      : undefined;
  if (timers instanceof DomainError) return timers;

  const existing = await prisma.recipe.findFirst({
    where: { id, householdId },
    select: { id: true },
  });
  if (!existing) {
    return DomainError.notFound("Recipe not found.");
  }

  const duplicate = await prisma.recipe.findFirst({
    where: {
      householdId,
      title: { equals: normalized.title, mode: "insensitive" },
      NOT: { id },
    },
    select: { id: true },
  });
  if (duplicate) {
    return DomainError.conflict("Recipe title already exists", "title_conflict");
  }

  const instructions = normalized.steps.join("\n");

  // Full-replace: omitted nutrition → null; thumbnail_url omitted → null when key absent from merge callers they must send current value
  const thumbnailUrl =
    input.thumbnail_url === undefined
      ? null
      : input.thumbnail_url === null
        ? null
        : String(input.thumbnail_url).trim() || null;

  const recipe = await prisma.$transaction(async (tx) => {
    await tx.recipeIngredient.deleteMany({ where: { recipeId: id } });
    await tx.recipeStep.deleteMany({ where: { recipeId: id } });
    if (timers !== undefined) {
      await tx.recipeTimer.deleteMany({ where: { recipeId: id } });
    }

    return tx.recipe.update({
      where: { id },
      data: {
        title: normalized.title,
        instructions,
        servings: normalized.servings,
        tags: normalized.tags,
        calories: normalized.calories,
        proteinG: normalized.proteinG,
        carbsG: normalized.carbsG,
        fatG: normalized.fatG,
        thumbnailUrl,
        ingredients: {
          create: normalized.ingredients.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            group: item.group,
            optional: item.optional,
          })),
        },
        steps: {
          create: normalized.steps.map((text, index) => ({
            text,
            optional: normalized.stepOptional[index] ?? false,
            sortOrder: index,
          })),
        },
        ...(timers !== undefined
          ? {
              timers: {
                create: timers.map((timer) => ({
                  label: timer.label,
                  minutes: timer.minutes,
                })),
              },
            }
          : {}),
      },
      include: {
        ingredients: true,
        steps: { orderBy: { sortOrder: "asc" } },
      },
    });
  });

  return toRecipeDetail(recipe);
}
