import { TodayTile } from "@/components/dashboard/TodayTile";
import { HomeFeed } from "@/components/dashboard/HomeFeed";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getNotifications } from "@/core/notifications/service";
import { requireHousehold } from "@/core/auth/session";
import { getDashboardTodos } from "@/modules/tasks/actions";
import { getLowStockProducts } from "@/modules/inventory/actions";
import { CheckSquare, AlertTriangle } from "lucide-react";

export default async function DashboardPage() {
  const { householdId } = await requireHousehold();
  const [notifications, todos, lowStock] = await Promise.all([
    getNotifications(householdId),
    getDashboardTodos(),
    getLowStockProducts(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-zinc-500">Your household at a glance</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <TodayTile />
        </div>
        <div className="lg:col-span-2">
          <HomeFeed notifications={notifications} />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckSquare className="h-5 w-5 text-emerald-600" />
              To-Do List
            </CardTitle>
          </CardHeader>
          <CardContent>
            {todos.length === 0 ? (
              <p className="text-sm text-zinc-500">No upcoming chores.</p>
            ) : (
              <ul className="space-y-2">
                {todos.map((chore) => (
                  <li key={chore.id} className="flex justify-between rounded-lg border p-3 text-sm">
                    <div>
                      <p className="font-medium">{chore.title}</p>
                      {chore.nextDue && (
                        <p className="text-zinc-500">Due: {new Date(chore.nextDue).toLocaleDateString()}</p>
                      )}
                    </div>
                    {chore.avgDuration && (
                      <span className="text-xs text-zinc-400">~{chore.avgDuration} min avg</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Low Stock
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lowStock.length === 0 ? (
              <p className="text-sm text-zinc-500">All stocked up!</p>
            ) : (
              <ul className="space-y-2">
                {lowStock.map((p) => (
                  <li key={p.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/20">
                    {p.name}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
