import { DomainError } from "@/domain/error";
import type { AddRecipeInput, RecipeIngredientItem, RecipeTimerItem } from "./types";

export const MAX_TITLE_LEN = 200;
export const MAX_INGREDIENTS = 50;
export const MAX_STEPS = 100;
export const MAX_STEP_LEN = 2000;
export const MAX_GROUP_LEN = 40;
export const MAX_TAGS = 20;
export const MAX_TAG_LEN = 40;
export const MAX_TIMERS = 20;
export const MAX_TIMER_LABEL_LEN = 80;

export type NormalizedRecipeFields = {
  title: string;
  servings: number;
  ingredients: {
    name: string;
    quantity: string;
    group: string | null;
    optional: boolean;
  }[];
  steps: string[];
  stepOptional: boolean[];
  tags: string[];
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  thumbnailUrl: string | null;
  timers?: { label: string; minutes: number }[];
};

export function normalizeTags(tags: string[] | undefined): string[] | DomainError {
  if (!tags || tags.length === 0) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = (raw ?? "").trim().toLowerCase();
    if (!tag) continue;
    if (tag.length > MAX_TAG_LEN) {
      return DomainError.invalidInput("Recipe too large");
    }
    if (seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  if (out.length > MAX_TAGS) {
    return DomainError.invalidInput("Recipe too large");
  }
  return out;
}

function normalizeNutrition(
  value: number | undefined | null,
): number | null | DomainError {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return DomainError.invalidInput("Invalid recipe payload");
  }
  return value;
}

function normalizeIngredients(
  ingredients: RecipeIngredientItem[] | undefined,
): NormalizedRecipeFields["ingredients"] | DomainError {
  const mapped = (ingredients ?? [])
    .map((item) => {
      const groupRaw = (item.group ?? "").trim();
      return {
        name: (item.name ?? "").trim(),
        quantity: (item.quantity ?? "").trim() || "1",
        group: groupRaw || null,
        optional: Boolean(item.optional),
      };
    })
    .filter((item) => item.name);

  if (mapped.length === 0) {
    return DomainError.invalidInput("Invalid recipe payload");
  }
  if (
    mapped.length > MAX_INGREDIENTS ||
    mapped.some((item) => (item.group?.length ?? 0) > MAX_GROUP_LEN)
  ) {
    return DomainError.invalidInput("Recipe too large");
  }
  return mapped;
}

function normalizeSteps(
  steps: string[] | undefined,
  stepOptional: boolean[] | undefined,
): { steps: string[]; stepOptional: boolean[] } | DomainError {
  const cleaned = (steps ?? []).map((s) => s.trim()).filter(Boolean);
  if (cleaned.length === 0) {
    return DomainError.invalidInput("Invalid recipe payload");
  }
  if (
    cleaned.length > MAX_STEPS ||
    cleaned.some((s) => s.length > MAX_STEP_LEN)
  ) {
    return DomainError.invalidInput("Recipe too large");
  }

  let flags: boolean[];
  if (stepOptional === undefined || stepOptional === null) {
    flags = cleaned.map(() => false);
  } else if (stepOptional.length !== cleaned.length) {
    return DomainError.invalidInput("Invalid recipe payload");
  } else {
    flags = stepOptional.map((v) => Boolean(v));
  }
  return { steps: cleaned, stepOptional: flags };
}

/**
 * Parse timer rows for UI/actions. Blank lines omitted.
 * Partial rows (label without minutes or vice versa) → DomainError.
 */
export function normalizeTimers(
  timers: RecipeTimerItem[] | undefined,
): { label: string; minutes: number }[] | DomainError {
  if (!timers || timers.length === 0) return [];
  const out: { label: string; minutes: number }[] = [];
  for (const row of timers) {
    const label = (row.label ?? "").trim();
    const minutesRaw = row.minutes;
    const hasLabel = label.length > 0;
    const hasMinutes =
      minutesRaw !== undefined &&
      minutesRaw !== null &&
      String(minutesRaw).toString().trim() !== "";

    if (!hasLabel && !hasMinutes) continue;
    if (!hasLabel || !hasMinutes) {
      return DomainError.invalidInput("Invalid recipe payload");
    }
    const minutes = Math.floor(Number(minutesRaw));
    if (!Number.isFinite(minutes) || minutes < 1) {
      return DomainError.invalidInput("Invalid recipe payload");
    }
    if (label.length > MAX_TIMER_LABEL_LEN) {
      return DomainError.invalidInput("Recipe too large");
    }
    out.push({ label, minutes });
  }
  if (out.length > MAX_TIMERS) {
    return DomainError.invalidInput("Recipe too large");
  }
  return out;
}

export function normalizeRecipeInput(
  input: AddRecipeInput | Omit<AddRecipeInput, never>,
): NormalizedRecipeFields | DomainError {
  const title = (input.title ?? "").trim();
  if (!title) {
    return DomainError.invalidInput("Invalid recipe payload");
  }
  if (title.length > MAX_TITLE_LEN) {
    return DomainError.invalidInput("Recipe too large");
  }

  const ingredients = normalizeIngredients(input.ingredients);
  if (ingredients instanceof DomainError) return ingredients;

  const stepResult = normalizeSteps(input.steps, input.step_optional);
  if (stepResult instanceof DomainError) return stepResult;

  const tags = normalizeTags(input.tags);
  if (tags instanceof DomainError) return tags;

  const calories = normalizeNutrition(input.calories);
  if (calories instanceof DomainError) return calories;
  const proteinG = normalizeNutrition(input.protein_g);
  if (proteinG instanceof DomainError) return proteinG;
  const carbsG = normalizeNutrition(input.carbs_g);
  if (carbsG instanceof DomainError) return carbsG;
  const fatG = normalizeNutrition(input.fat_g);
  if (fatG instanceof DomainError) return fatG;

  let servings = input.servings ?? 4;
  if (!Number.isFinite(servings) || servings < 1) {
    servings = 4;
  }
  servings = Math.floor(servings);

  const thumbnailUrl =
    input.thumbnail_url === undefined || input.thumbnail_url === null
      ? null
      : String(input.thumbnail_url).trim() || null;

  return {
    title,
    servings,
    ingredients,
    steps: stepResult.steps,
    stepOptional: stepResult.stepOptional,
    tags,
    calories,
    proteinG,
    carbsG,
    fatG,
    thumbnailUrl,
  };
}

/** Parse "label|minutes" lines from FormData; blank lines omitted; partial → error. */
export function parseTimerLines(
  raw: string,
): { label: string; minutes: number }[] | DomainError {
  const lines = raw.split("\n");
  const items: RecipeTimerItem[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split("|").map((s) => s.trim());
    const label = parts[0] ?? "";
    const minutesPart = parts[1] ?? "";
    if (!label && !minutesPart) continue;
    if (!label || !minutesPart) {
      return DomainError.invalidInput("Invalid recipe payload");
    }
    const minutes = parseInt(minutesPart, 10);
    items.push({ label, minutes });
  }
  return normalizeTimers(items);
}
