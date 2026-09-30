"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FormAction } from "@/components/ui/form-action";
import { useFormError } from "@/components/ui/form-error-context";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MealPlanDayDto, MealPlanDto } from "@/domain/meal-plan";
import {
  addWeekToShoppingAction,
  assignDinnerAction,
  clearDinnerAction,
  randomFillAction,
} from "@/modules/meal-plan/actions";
import { Shuffle, ShoppingCart, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";

/** UTC midnight so a `YYYY-MM-DD` key never shifts across the locale's day. */
function dayDate(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00Z`);
}

export function MealPlanClient({
  data,
  canMutate,
}: {
  data: MealPlanDto;
  canMutate: boolean;
}) {
  const t = useTranslations("mealPlan");
  const locale = useLocale();
  const { handleActionResult } = useFormError();

  const [surpriseFeedback, setSurpriseFeedback] = useState<string | null>(null);
  const [shoppingFeedback, setShoppingFeedback] = useState<string | null>(null);
  const [shoppingErrors, setShoppingErrors] = useState(0);
  const [surprisePending, startSurprise] = useTransition();
  const [shoppingPending, startShopping] = useTransition();

  const shortDate = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }),
    [locale],
  );
  const weekday = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }),
    [locale],
  );

  const emptyDays = data.days.filter((day) => !day.recipeId).length;
  const plannedDays = data.days.length - emptyDays;
  const canSurprise =
    canMutate && emptyDays > 0 && data.recipes.length > 0 && !surprisePending;
  const canAddToShopping = canMutate && plannedDays > 0 && !shoppingPending;

  const weekLabel = `${shortDate.format(dayDate(data.weekStart))} – ${shortDate.format(dayDate(data.weekEnd))}`;

  function onSurprise() {
    setSurpriseFeedback(null);
    const formData = new FormData();
    formData.set("weekStart", data.weekStart);
    startSurprise(async () => {
      const result = await randomFillAction(formData);
      if (handleActionResult(result, "randomFill") || !result.ok) return;
      const filled = result.data?.filled ?? 0;
      setSurpriseFeedback(
        filled > 0
          ? t("surpriseResult", { count: filled })
          : t("surpriseNone"),
      );
    });
  }

  function onAddToShopping() {
    setShoppingFeedback(null);
    setShoppingErrors(0);
    const formData = new FormData();
    formData.set("weekStart", data.weekStart);
    startShopping(async () => {
      const result = await addWeekToShoppingAction(formData);
      if (handleActionResult(result, "addWeekToShopping") || !result.ok) return;
      const payload = result.data;
      if (!payload) return;
      setShoppingFeedback(
        t("shoppingResult", {
          added: payload.added.length,
          skipped: payload.skipped.length,
        }),
      );
      setShoppingErrors(payload.errors.length);
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-zinc-500">{t("subtitle")}</p>
        <p className="mt-1 text-sm font-medium text-zinc-600 dark:text-zinc-300">
          {weekLabel}
        </p>
      </div>

      {canMutate && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={onSurprise}
            disabled={!canSurprise}
            className="gap-2"
          >
            <Shuffle className="h-4 w-4" />
            {t("surprise")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onAddToShopping}
            disabled={!canAddToShopping}
            className="gap-2"
          >
            <ShoppingCart className="h-4 w-4" />
            {t("addMissing")}
          </Button>
          {surpriseFeedback && (
            <span className="text-sm text-zinc-600 dark:text-zinc-300">
              {surpriseFeedback}
            </span>
          )}
          {shoppingFeedback && (
            <span className="text-sm text-zinc-600 dark:text-zinc-300">
              {shoppingFeedback}
            </span>
          )}
          {shoppingErrors > 0 && (
            <span className="text-sm text-amber-800 dark:text-amber-200/90">
              {t("shoppingErrors", { count: shoppingErrors })}
            </span>
          )}
        </div>
      )}

      {data.recipes.length === 0 && (
        <EmptyState message={t("noRecipes")} />
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {data.days.map((day) => (
          <DayCard
            key={`${day.date}:${day.recipeId ?? ""}`}
            day={day}
            recipes={data.recipes}
            canMutate={canMutate}
            weekdayLabel={weekday.format(dayDate(day.date))}
            assignLabel={day.recipeId ? t("change") : t("assign")}
            emptyLabel={t("emptySlot")}
            chooseLabel={t("chooseRecipe")}
            clearLabel={t("clear")}
          />
        ))}
      </div>
    </div>
  );
}

function DayCard({
  day,
  recipes,
  canMutate,
  weekdayLabel,
  assignLabel,
  emptyLabel,
  chooseLabel,
  clearLabel,
}: {
  day: MealPlanDayDto;
  recipes: MealPlanDto["recipes"];
  canMutate: boolean;
  weekdayLabel: string;
  assignLabel: string;
  emptyLabel: string;
  chooseLabel: string;
  clearLabel: string;
}) {
  const [selected, setSelected] = useState("");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{weekdayLabel}</CardTitle>
        <p className="text-xs text-zinc-500">{day.date}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {day.recipeId ? (
          <p className="text-sm font-medium">{day.title}</p>
        ) : (
          <EmptyState message={emptyLabel} />
        )}

        {canMutate && (
          <>
            <FormAction
              action={assignDinnerAction}
              actionName="assignDinner"
              className="space-y-2"
            >
              <input type="hidden" name="date" value={day.date} />
              <input type="hidden" name="recipeId" value={selected} />
              <Select
                value={selected}
                onValueChange={setSelected}
                disabled={recipes.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder={chooseLabel} />
                </SelectTrigger>
                <SelectContent>
                  {recipes.map((recipe) => (
                    <SelectItem key={recipe.id} value={recipe.id}>
                      {recipe.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="submit" size="sm" disabled={selected === ""}>
                {assignLabel}
              </Button>
            </FormAction>

            {day.recipeId && (
              <FormAction
                action={clearDinnerAction}
                actionName="clearDinner"
              >
                <input type="hidden" name="date" value={day.date} />
                <Button
                  type="submit"
                  variant="destructive"
                  size="sm"
                  className="gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  {clearLabel}
                </Button>
              </FormAction>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
