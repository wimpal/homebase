"use client";

import { useActionState, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  createRecipeWithState,
  addLeftover,
  type RecipeFormState,
} from "@/modules/recipes/actions";
import { Timer } from "lucide-react";

interface Recipe {
  id: string;
  title: string;
  instructions: string;
  servings: number;
  ingredients: { name: string; quantity: string; product: { name: string } | null }[];
  timers: { id: string; label: string; minutes: number }[];
  leftovers: { name: string; servings: number; frozenAt: Date }[];
}

const initialFormState: RecipeFormState = {};

function parseSteps(instructions: string): string[] {
  return instructions
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function RecipesClient({ recipes }: { recipes: Recipe[] }) {
  const t = useTranslations("recipes");
  const tc = useTranslations("common");
  const format = useFormatter();
  const [activeTimers, setActiveTimers] = useState<Record<string, number>>({});
  const [showAddForm, setShowAddForm] = useState(recipes.length === 0);
  const [createState, createAction, createPending] = useActionState(
    createRecipeWithState,
    initialFormState,
  );

  function startTimer(id: string, minutes: number) {
    setActiveTimers((prev) => ({ ...prev, [id]: minutes * 60 }));
    const interval = setInterval(() => {
      setActiveTimers((prev) => {
        const remaining = (prev[id] ?? 0) - 1;
        if (remaining <= 0) {
          clearInterval(interval);
          const next = { ...prev };
          delete next[id];
          return next;
        }
        return { ...prev, [id]: remaining };
      });
    }, 1000);
  }

  const formatTimer = (s: number) =>
    `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-zinc-500">{t("subtitle")}</p>
      </div>

      <Tabs defaultValue="recipes">
        <TabsList>
          <TabsTrigger value="recipes">{t("recipesTab")}</TabsTrigger>
          <TabsTrigger value="leftovers">{t("leftoversTab")}</TabsTrigger>
        </TabsList>

        <TabsContent value="recipes" className="space-y-4">
          <div className="flex gap-2">
            <Button
              type="button"
              variant={showAddForm ? "outline" : "default"}
              onClick={() => setShowAddForm((open) => !open)}
            >
              {showAddForm ? t("cancelAdd") : t("addRecipe")}
            </Button>
          </div>

          {showAddForm && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("addRecipe")}</CardTitle>
              </CardHeader>
              <CardContent>
                <form action={createAction} className="space-y-3">
                  <div>
                    <Label>{tc("title")}</Label>
                    <Input name="title" required />
                  </div>
                  <div>
                    <Label>{t("servings")}</Label>
                    <Input name="servings" type="number" defaultValue="4" />
                  </div>
                  <div>
                    <Label>{t("ingredientsPerLine")}</Label>
                    <Textarea
                      name="ingredients"
                      placeholder={t("ingredientsPlaceholder")}
                      required
                    />
                  </div>
                  <div>
                    <Label>{t("stepsPerLine")}</Label>
                    <Textarea
                      name="instructions"
                      rows={5}
                      placeholder={t("stepsPlaceholder")}
                      required
                    />
                  </div>
                  <div>
                    <Label>{t("timersPerLine")}</Label>
                    <Textarea name="timers" placeholder={t("timersPlaceholder")} />
                  </div>
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
          )}

          {recipes.length === 0 ? (
            <p className="text-sm text-zinc-500">{t("noRecipes")}</p>
          ) : (
            recipes.map((recipe) => {
              const steps = parseSteps(recipe.instructions);
              return (
                <Card key={recipe.id}>
                  <CardHeader>
                    <CardTitle className="text-base">{recipe.title}</CardTitle>
                    <p className="text-sm text-zinc-500">
                      {t("servingsCount", { count: recipe.servings })}
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <p className="text-sm font-medium">{t("ingredients")}</p>
                      <ul className="list-disc pl-5 text-sm text-zinc-600">
                        {recipe.ingredients.map((ing, i) => (
                          <li key={i}>
                            {ing.quantity} {ing.name}{" "}
                            {ing.product && t("inStock", { name: ing.product.name })}
                          </li>
                        ))}
                      </ul>
                    </div>
                    {recipe.timers.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {recipe.timers.map((timer) => (
                          <Button
                            key={timer.id}
                            variant="outline"
                            size="sm"
                            onClick={() => startTimer(timer.id, timer.minutes)}
                            disabled={!!activeTimers[timer.id]}
                          >
                            <Timer className="mr-1 h-3 w-3" />
                            {timer.label} (
                            {activeTimers[timer.id] != null
                              ? formatTimer(activeTimers[timer.id])
                              : `${timer.minutes}m`}
                            )
                          </Button>
                        ))}
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium">{t("steps")}</p>
                      {steps.length > 0 ? (
                        <ol className="list-decimal space-y-1 pl-5 text-sm text-zinc-600">
                          {steps.map((step, i) => (
                            <li key={i}>{step}</li>
                          ))}
                        </ol>
                      ) : (
                        <p className="text-sm text-zinc-500">{tc("emDash")}</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="leftovers">
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

          {recipes.flatMap((r) => r.leftovers).length === 0 ? (
            <p className="text-sm text-zinc-500">{t("noLeftovers")}</p>
          ) : (
            recipes.flatMap((r) =>
              r.leftovers.map((l) => (
                <Card key={l.name + l.frozenAt.toString()}>
                  <CardContent className="p-4">
                    <p className="font-medium">{l.name}</p>
                    <p className="text-sm text-zinc-500">
                      {t("servingsFrozen", {
                        servings: l.servings,
                        date: format.dateTime(new Date(l.frozenAt), {
                          dateStyle: "medium",
                        }),
                      })}
                    </p>
                  </CardContent>
                </Card>
              )),
            )
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
