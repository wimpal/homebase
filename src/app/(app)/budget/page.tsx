import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { getBudgets, createBudget, addExpense } from "@/modules/recipes/actions";
import { getBudgetRemaining } from "@/lib/budget";
import { requireHousehold } from "@/core/auth/session";
import { requireModule } from "@/core/modules/guard";
import { ModuleId } from "@prisma/client";
import { formatCurrency } from "@/lib/utils";
import { getLocale, getTranslations } from "next-intl/server";
import { isLocale, localeToBcp47 } from "@/i18n/config";

export default async function BudgetPage() {
  const { householdId } = await requireHousehold();
  await requireModule(householdId, ModuleId.BUDGET);
  const budgets = await getBudgets();
  const t = await getTranslations("budget");
  const tc = await getTranslations("common");
  const localeRaw = await getLocale();
  const bcp47 = localeToBcp47(isLocale(localeRaw) ? localeRaw : "en");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-zinc-500">{t("subtitle")}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">{t("createBudget")}</CardTitle></CardHeader>
          <CardContent>
            <form action={createBudget} className="space-y-3">
              <div><Label>{tc("name")}</Label><Input name="name" required /></div>
              <div><Label>{tc("category")}</Label><Input name="category" required /></div>
              <div><Label>{t("amount")}</Label><Input name="amount" type="number" step="0.01" required /></div>
              <div>
                <Label>{t("period")}</Label>
                <select name="period" className="flex h-10 w-full rounded-md border px-3 text-sm">
                  <option value="monthly">{t("monthly")}</option>
                  <option value="weekly">{t("weekly")}</option>
                  <option value="yearly">{t("yearly")}</option>
                </select>
              </div>
              <Button type="submit">{t("createBudgetBtn")}</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">{t("logExpense")}</CardTitle></CardHeader>
          <CardContent>
            <form action={addExpense} className="space-y-3">
              <div><Label>{tc("description")}</Label><Input name="description" required /></div>
              <div><Label>{t("amount")}</Label><Input name="amount" type="number" step="0.01" required /></div>
              <div><Label>{tc("category")}</Label><Input name="category" /></div>
              <div>
                <Label>{t("budget")}</Label>
                <select name="budgetId" className="flex h-10 w-full rounded-md border px-3 text-sm">
                  <option value="">{tc("noneOption")}</option>
                  {budgets.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <Button type="submit">{t("logExpenseBtn")}</Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {budgets.map((budget) => {
          const { spent, remaining } = getBudgetRemaining(budget);
          const percent = Math.min(100, (spent / budget.amount) * 100);
          return (
            <Card key={budget.id}>
              <CardHeader>
                <CardTitle className="text-base">{budget.name}</CardTitle>
                <p className="text-sm text-zinc-500">{budget.category} · {budget.period}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span>{t("spent", { amount: formatCurrency(spent, bcp47) })}</span>
                  <span>{t("remaining", { amount: formatCurrency(remaining, bcp47) })}</span>
                </div>
                <Progress value={percent} />
                <p className="text-xs text-zinc-400">{t("budgetAmount", { amount: formatCurrency(budget.amount, bcp47) })}</p>
                {budget.expenses.slice(0, 5).map((e) => (
                  <p key={e.id} className="text-sm text-zinc-600">
                    {e.description}: {formatCurrency(e.amount, bcp47)}
                  </p>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
