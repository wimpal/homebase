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

export default async function BudgetPage() {
  const { householdId } = await requireHousehold();
  await requireModule(householdId, ModuleId.BUDGET);
  const budgets = await getBudgets();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Budget</h1>
        <p className="text-zinc-500">Track spending by category</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Create Budget</CardTitle></CardHeader>
          <CardContent>
            <form action={createBudget} className="space-y-3">
              <div><Label>Name</Label><Input name="name" required /></div>
              <div><Label>Category</Label><Input name="category" required /></div>
              <div><Label>Amount</Label><Input name="amount" type="number" step="0.01" required /></div>
              <div>
                <Label>Period</Label>
                <select name="period" className="flex h-10 w-full rounded-md border px-3 text-sm">
                  <option value="monthly">Monthly</option>
                  <option value="weekly">Weekly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
              <Button type="submit">Create Budget</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Log Expense</CardTitle></CardHeader>
          <CardContent>
            <form action={addExpense} className="space-y-3">
              <div><Label>Description</Label><Input name="description" required /></div>
              <div><Label>Amount</Label><Input name="amount" type="number" step="0.01" required /></div>
              <div><Label>Category</Label><Input name="category" /></div>
              <div>
                <Label>Budget</Label>
                <select name="budgetId" className="flex h-10 w-full rounded-md border px-3 text-sm">
                  <option value="">None</option>
                  {budgets.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <Button type="submit">Log Expense</Button>
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
                  <span>Spent: {formatCurrency(spent)}</span>
                  <span>Remaining: {formatCurrency(remaining)}</span>
                </div>
                <Progress value={percent} />
                <p className="text-xs text-zinc-400">Budget: {formatCurrency(budget.amount)}</p>
                {budget.expenses.slice(0, 5).map((e) => (
                  <p key={e.id} className="text-sm text-zinc-600">
                    {e.description}: {formatCurrency(e.amount)}
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
