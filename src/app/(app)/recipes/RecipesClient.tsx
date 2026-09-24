"use client";

import {
  Fragment,
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmForm } from "@/components/ui/confirm-form";
import { CollapsibleCreate } from "@/components/ui/collapsible-create";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  addRecipeToShoppingAction,
  createRecipeWithState,
  deleteRecipe,
  addLeftover,
  deleteLeftover,
  updateRecipeWithState,
  uploadRecipeThumbnail,
  type RecipeFormState,
} from "@/modules/recipes/actions";
import { Timer, ImageIcon, ShoppingCart, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface RecipeIngredient {
  name: string;
  quantity: string;
  group: string | null;
  optional?: boolean;
  product: { name: string } | null;
}

interface RecipeStep {
  text: string;
  optional: boolean;
  sortOrder: number;
}

interface Recipe {
  id: string;
  title: string;
  instructions: string;
  servings: number;
  tags: string[];
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  thumbnailUrl: string | null;
  ingredients: RecipeIngredient[];
  steps?: RecipeStep[];
  timers: { id: string; label: string; minutes: number }[];
}

const GROUP_LABEL_KEYS: Record<string, string> = {
  dressing: "groupDressing",
  marinade: "groupMarinade",
  sauce: "groupSauce",
  topping: "groupTopping",
  garnish: "groupGarnish",
};

const initialFormState: RecipeFormState = {};

function resolveSteps(recipe: Recipe): { text: string; optional: boolean }[] {
  if (recipe.steps && recipe.steps.length > 0) {
    return [...recipe.steps]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s) => ({ text: s.text, optional: Boolean(s.optional) }));
  }
  return recipe.instructions
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((text) => ({ text, optional: false }));
}

function normalizeGroup(group: string | null | undefined): string | null {
  const trimmed = group?.trim();
  return trimmed || null;
}

function ingredientsToFormValue(ingredients: RecipeIngredient[]): string {
  return ingredients
    .map((ing) => {
      const parts = [ing.name, ing.quantity || "1"];
      if (ing.group || ing.optional) {
        parts.push(ing.group?.trim() || "");
      }
      if (ing.optional) {
        parts.push("1");
      }
      return parts.join("|");
    })
    .join("\n");
}

function stepsToFormValues(steps: { text: string; optional: boolean }[]): {
  instructions: string;
} {
  return {
    instructions: steps
      .map((s) => (s.optional ? `${s.text}|1` : s.text))
      .join("\n"),
  };
}

function RecipeFormFields({
  recipe,
  timersDefault,
}: {
  recipe?: Recipe;
  timersDefault?: string;
}) {
  const t = useTranslations("recipes");
  const tc = useTranslations("common");
  const steps = recipe ? resolveSteps(recipe) : [];
  const stepForm = stepsToFormValues(steps);

  return (
    <>
      <div>
        <Label>{tc("title")}</Label>
        <Input name="title" required defaultValue={recipe?.title ?? ""} />
      </div>
      <div>
        <Label>{t("servings")}</Label>
        <Input
          name="servings"
          type="number"
          defaultValue={String(recipe?.servings ?? 4)}
        />
      </div>
      <div>
        <Label>{t("tagsLabel")}</Label>
        <Input
          name="tags"
          placeholder={t("tagsPlaceholder")}
          defaultValue={recipe?.tags?.join(", ") ?? ""}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>{t("calories")}</Label>
          <Input
            name="calories"
            type="number"
            min={0}
            step="any"
            defaultValue={recipe?.calories ?? ""}
            placeholder={t("optionalBlank")}
          />
        </div>
        <div>
          <Label>{t("proteinG")}</Label>
          <Input
            name="protein_g"
            type="number"
            min={0}
            step="any"
            defaultValue={recipe?.proteinG ?? ""}
            placeholder={t("optionalBlank")}
          />
        </div>
        <div>
          <Label>{t("carbsG")}</Label>
          <Input
            name="carbs_g"
            type="number"
            min={0}
            step="any"
            defaultValue={recipe?.carbsG ?? ""}
            placeholder={t("optionalBlank")}
          />
        </div>
        <div>
          <Label>{t("fatG")}</Label>
          <Input
            name="fat_g"
            type="number"
            min={0}
            step="any"
            defaultValue={recipe?.fatG ?? ""}
            placeholder={t("optionalBlank")}
          />
        </div>
      </div>
      <div>
        <Label>{t("ingredientsPerLine")}</Label>
        <p className="mb-1 text-xs text-zinc-500">{t("ingredientsHint")}</p>
        <Textarea
          name="ingredients"
          placeholder={t("ingredientsPlaceholder")}
          required
          defaultValue={
            recipe ? ingredientsToFormValue(recipe.ingredients) : undefined
          }
        />
      </div>
      <div>
        <Label>{t("stepsPerLine")}</Label>
        <p className="mb-1 text-xs text-zinc-500">{t("stepsOptionalHint")}</p>
        <Textarea
          name="instructions"
          rows={5}
          placeholder={t("stepsPlaceholder")}
          required
          defaultValue={stepForm.instructions || undefined}
        />
      </div>
      <div>
        <Label>{t("timersPerLine")}</Label>
        <Textarea
          name="timers"
          placeholder={t("timersPlaceholder")}
          defaultValue={timersDefault}
        />
      </div>
      {recipe?.thumbnailUrl ? (
        <input type="hidden" name="thumbnailUrl" value={recipe.thumbnailUrl} />
      ) : null}
    </>
  );
}

export function RecipesClient({
  recipes,
  leftovers,
}: {
  recipes: Recipe[];
  leftovers: { id: string; name: string; servings: number; frozenAt: Date }[];
}) {
  const t = useTranslations("recipes");
  const tc = useTranslations("common");
  const format = useFormatter();
  const [activeTimers, setActiveTimers] = useState<Record<string, number>>({});
  const intervalRefs = useRef<Record<string, ReturnType<typeof setInterval>>>(
    {},
  );
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [includeOptional, setIncludeOptional] = useState(false);
  const [shopFeedback, setShopFeedback] = useState<string | null>(null);
  const [shopPending, startShopTransition] = useTransition();
  const [uploadPending, startUploadTransition] = useTransition();

  const [createState, createAction, createPending] = useActionState(
    createRecipeWithState,
    initialFormState,
  );
  const [updateState, updateAction, updatePending] = useActionState(
    updateRecipeWithState,
    initialFormState,
  );

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const r of recipes) {
      for (const tag of r.tags ?? []) {
        if (tag) set.add(tag);
      }
    }
    return [...set].sort();
  }, [recipes]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return recipes.filter((r) => {
      if (tagFilter && !(r.tags ?? []).includes(tagFilter)) return false;
      if (!q) return true;
      return (
        r.title.toLowerCase().includes(q) ||
        (r.tags ?? []).some((tag) => tag.includes(q))
      );
    });
  }, [recipes, query, tagFilter]);

  const selected = recipes.find((r) => r.id === selectedId) ?? null;

  useEffect(() => {
    return () => {
      for (const id of Object.keys(intervalRefs.current)) {
        clearInterval(intervalRefs.current[id]);
      }
    };
  }, []);

  useEffect(() => {
    if (updateState.ok) {
      setEditing(false);
    }
  }, [updateState.ok]);

  function clearTimerInterval(id: string) {
    const handle = intervalRefs.current[id];
    if (handle) {
      clearInterval(handle);
      delete intervalRefs.current[id];
    }
  }

  function stopTimer(id: string) {
    clearTimerInterval(id);
    setActiveTimers((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function startTimer(id: string, minutes: number) {
    clearTimerInterval(id);
    setActiveTimers((prev) => ({ ...prev, [id]: minutes * 60 }));
    const interval = setInterval(() => {
      setActiveTimers((prev) => {
        const remaining = (prev[id] ?? 0) - 1;
        if (remaining <= 0) {
          clearTimerInterval(id);
          const next = { ...prev };
          delete next[id];
          return next;
        }
        return { ...prev, [id]: remaining };
      });
    }, 1000);
    intervalRefs.current[id] = interval;
  }

  function closeOverlay(open: boolean) {
    if (!open) {
      if (selected) {
        for (const timer of selected.timers) {
          stopTimer(timer.id);
        }
      }
      setSelectedId(null);
      setEditing(false);
      setShopFeedback(null);
      setIncludeOptional(false);
    }
  }

  const formatTimer = (s: number) =>
    `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  function onAddToShopping() {
    if (!selected) return;
    setShopFeedback(null);
    startShopTransition(async () => {
      const result = await addRecipeToShoppingAction(
        selected.id,
        includeOptional,
      );
      if (result.error) {
        setShopFeedback(result.error);
        return;
      }
      setShopFeedback(
        t("shoppingResult", {
          added: result.added.length,
          skipped: result.skipped.length,
        }),
      );
    });
  }

  function onUploadThumbnail(file: File | null) {
    if (!selected || !file) return;
    const fd = new FormData();
    fd.set("id", selected.id);
    fd.set("file", file);
    startUploadTransition(async () => {
      await uploadRecipeThumbnail(fd);
    });
  }

  const timersDefaultForEdit = selected
    ? selected.timers.map((tm) => `${tm.label}|${tm.minutes}`).join("\n")
    : "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2yl font-bold">{t("title")}</h1>
        <p className="text-zinc-500">{t("subtitle")}</p>
      </div>

      <Tabs defaultValue="recipes">
        <TabsList>
          <TabsTrigger value="recipes">{t("recipesTab")}</TabsTrigger>
          <TabsTrigger value="leftovers">{t("leftoversTab")}</TabsTrigger>
        </TabsList>

        <TabsContent value="recipes" className="space-y-4">
          <CollapsibleCreate
            openLabel={t("addRecipe")}
            cancelLabel={t("cancelAdd")}
            defaultOpen={recipes.length === 0}
          >
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("addRecipe")}</CardTitle>
              </CardHeader>
              <CardContent>
                <form action={createAction} className="space-y-3">
                  <RecipeFormFields />
                  {createState.error && (
                    <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                      {createState.error}
                    </p>
                  )}
                  <Button type="submit" disabled={createPending}>
                    {t("saveRecipe")}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </CollapsibleCreate>

          {recipes.length > 0 && (
            <div className="space-y-3">
              <Input
                placeholder={t("searchRecipes")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {allTags.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-zinc-500">{t("filterByTag")}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant={tagFilter === null ? "default" : "outline"}
                    onClick={() => setTagFilter(null)}
                  >
                    {t("clearFilter")}
                  </Button>
                  {allTags.map((tag) => (
                    <Button
                      key={tag}
                      type="button"
                      size="sm"
                      variant={tagFilter === tag ? "default" : "outline"}
                      onClick={() =>
                        setTagFilter((prev) => (prev === tag ? null : tag))
                      }
                    >
                      {tag}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          )}

          {recipes.length === 0 ? (
            <EmptyState message={t("noRecipes")} />
          ) : filtered.length === 0 ? (
            <EmptyState message={t("noMatch")} />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map((recipe) => (
                <button
                  key={recipe.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(recipe.id);
                    setEditing(false);
                    setShopFeedback(null);
                  }}
                  className="text-left"
                >
                  <Card className="h-full transition hover:border-emerald-400 hover:shadow-sm">
                    <div className="aspect-[4/3] overflow-hidden rounded-t-lg bg-zinc-100 dark:bg-zinc-900">
                      {recipe.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={recipe.thumbnailUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-zinc-400">
                          <ImageIcon className="h-10 w-10 opacity-40" />
                        </div>
                      )}
                    </div>
                    <CardHeader className="space-y-1 p-3">
                      <CardTitle className="line-clamp-2 text-base">
                        {recipe.title}
                      </CardTitle>
                      {(recipe.tags?.length ?? 0) > 0 && (
                        <p className="line-clamp-1 text-xs text-zinc-500">
                          {recipe.tags.join(" · ")}
                        </p>
                      )}
                      {recipe.calories != null && (
                        <p className="text-xs text-zinc-500">
                          {t("caloriesValue", { count: recipe.calories })}
                        </p>
                      )}
                    </CardHeader>
                  </Card>
                </button>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="leftovers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("trackLeftover")}</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={addLeftover} className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label>{tc("name")}</Label>
                  <Input name="name" required />
                </div>
                <div>
                  <Label>{t("servings")}</Label>
                  <Input name="servings" type="number" defaultValue="1" />
                </div>
                <div>
                  <Label>{t("expires")}</Label>
                  <Input name="expiresAt" type="date" />
                </div>
                <div>
                  <Label>{t("recipe")}</Label>
                  <select
                    name="recipeId"
                    className="flex h-10 w-full rounded-md border px-3 text-sm"
                  >
                    <option value="">{tc("noneOption")}</option>
                    {recipes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.title}
                      </option>
                    ))}
                  </select>
                </div>
                <Button type="submit">{t("addLeftover")}</Button>
              </form>
            </CardContent>
          </Card>

          {leftovers.length === 0 ? (
            <EmptyState message={t("noLeftovers")} />
          ) : (
            leftovers.map((l) => (
              <Card key={l.id}>
                <CardContent className="flex items-start justify-between gap-3 p-4">
                  <div>
                    <p className="font-medium">{l.name}</p>
                    <p className="text-sm text-zinc-500">
                      {t("servingsFrozen", {
                        servings: l.servings,
                        date: format.dateTime(new Date(l.frozenAt), {
                          dateStyle: "medium",
                        }),
                      })}
                    </p>
                  </div>
                  <ConfirmForm
                    action={deleteLeftover}
                    message={t("confirmDeleteLeftover")}
                  >
                    <input type="hidden" name="id" value={l.id} />
                    <Button type="submit" variant="destructive" size="sm">
                      {t("deleteLeftover")}
                    </Button>
                  </ConfirmForm>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!selected} onOpenChange={closeOverlay}>
        {selected && (
          <DialogContent className="w-[min(96vw,40rem)]">
            <DialogHeader>
              <DialogTitle>{selected.title}</DialogTitle>
              <DialogDescription>
                {t("servingsCount", { count: selected.servings })}
                {selected.calories != null
                  ? ` · ${t("caloriesValue", { count: selected.calories })}`
                  : ""}
              </DialogDescription>
            </DialogHeader>

            {editing ? (
              <form action={updateAction} className="space-y-3">
                <input type="hidden" name="id" value={selected.id} />
                <RecipeFormFields
                  recipe={selected}
                  timersDefault={timersDefaultForEdit}
                />
                {updateState.error && (
                  <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                    {updateState.error}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={updatePending}>
                    {t("saveChanges")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditing(false)}
                  >
                    {tc("cancel")}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="aspect-[16/9] overflow-hidden rounded-md bg-zinc-100 dark:bg-zinc-900">
                  {selected.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={selected.thumbnailUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-zinc-400">
                      <ImageIcon className="h-12 w-12 opacity-40" />
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <label className="inline-flex cursor-pointer">
                    <span className="inline-flex h-8 items-center rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900">
                      {uploadPending ? t("uploading") : t("uploadPhoto")}
                    </span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      disabled={uploadPending}
                      onChange={(e) => {
                        onUploadThumbnail(e.target.files?.[0] ?? null);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setEditing(true)}
                  >
                    {t("editRecipe")}
                  </Button>
                  <ConfirmForm
                    action={deleteRecipe}
                    message={t("confirmDelete")}
                  >
                    <input type="hidden" name="id" value={selected.id} />
                    <Button type="submit" variant="destructive" size="sm">
                      {t("deleteRecipe")}
                    </Button>
                  </ConfirmForm>
                </div>

                {(selected.tags?.length ?? 0) > 0 && (
                  <p className="text-sm text-zinc-600">
                    {selected.tags.join(" · ")}
                  </p>
                )}

                <div>
                  <p className="text-sm font-medium">{t("ingredients")}</p>
                  <ul className="list-disc pl-5 text-sm text-zinc-600">
                    {selected.ingredients.map((ing, i) => {
                      const group = normalizeGroup(ing.group);
                      const prevGroup = normalizeGroup(
                        selected.ingredients[i - 1]?.group,
                      );
                      const showHeading =
                        Boolean(group) && group !== prevGroup;
                      const labelKey = group
                        ? GROUP_LABEL_KEYS[group]
                        : undefined;
                      const heading =
                        group && labelKey
                          ? t(labelKey as "groupDressing")
                          : group;
                      return (
                        <Fragment key={i}>
                          {showHeading && (
                            <li className="mt-2 -ml-5 list-none font-medium text-zinc-800 first:mt-0">
                              {heading}
                            </li>
                          )}
                          <li
                            className={cn(
                              ing.optional && "italic text-zinc-400",
                            )}
                          >
                            {ing.quantity} {ing.name}
                            {ing.optional ? ` ${t("optionalMark")}` : ""}
                            {ing.product
                              ? ` ${t("inStock", { name: ing.product.name })}`
                              : ""}
                          </li>
                        </Fragment>
                      );
                    })}
                  </ul>
                </div>

                {selected.timers.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {selected.timers.map((timer) => {
                      const running = activeTimers[timer.id] != null;
                      return (
                        <div key={timer.id} className="flex gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              startTimer(timer.id, timer.minutes)
                            }
                            disabled={running}
                          >
                            <Timer className="mr-1 h-3 w-3" />
                            {timer.label} (
                            {running
                              ? formatTimer(activeTimers[timer.id])
                              : `${timer.minutes}m`}
                            )
                          </Button>
                          {running && (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => stopTimer(timer.id)}
                            >
                              <X className="mr-1 h-3 w-3" />
                              {t("stopTimer")}
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div>
                  <p className="text-sm font-medium">{t("steps")}</p>
                  {(() => {
                    const steps = resolveSteps(selected);
                    if (steps.length === 0) {
                      return (
                        <p className="text-sm text-zinc-500">{tc("emDash")}</p>
                      );
                    }
                    return (
                      <ol className="list-decimal space-y-1 pl-5 text-sm text-zinc-600">
                        {steps.map((step, i) => (
                          <li
                            key={i}
                            className={cn(
                              step.optional && "italic text-zinc-400",
                            )}
                          >
                            {step.text}
                            {step.optional ? ` ${t("optionalMark")}` : ""}
                          </li>
                        ))}
                      </ol>
                    );
                  })()}
                </div>

                <div className="space-y-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={includeOptional}
                      onChange={(e) => setIncludeOptional(e.target.checked)}
                    />
                    {t("includeOptional")}
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    disabled={shopPending}
                    onClick={onAddToShopping}
                  >
                    <ShoppingCart className="mr-1 h-3 w-3" />
                    {t("addToShopping")}
                  </Button>
                  {shopFeedback && (
                    <p className="text-sm text-emerald-700 dark:text-emerald-400">
                      {shopFeedback}
                    </p>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
