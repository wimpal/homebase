export function getBudgetRemaining(budget: { amount: number; expenses: { amount: number }[] }) {
  const spent = budget.expenses.reduce((s, e) => s + e.amount, 0);
  return { spent, remaining: budget.amount - spent };
}
