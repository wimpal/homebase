import Link from "next/link";
import { TodayTile } from "@/components/dashboard/TodayTile";
import { HomeFeed } from "@/components/dashboard/HomeFeed";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getNotifications } from "@/core/notifications/service";
import { requireHousehold } from "@/core/auth/session";
import { isModuleEnabled } from "@/core/modules/settings";
import { prisma } from "@/core/db";
import { getDashboardTodos } from "@/modules/tasks/actions";
import { getLowStockProducts } from "@/modules/inventory/actions";
import { EmptyState } from "@/components/ui/empty-state";
import { CheckSquare, AlertTriangle } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { formatDate } from "@/lib/utils";
import { isLocale, localeToBcp47 } from "@/i18n/config";
import { ModuleId } from "@prisma/client";
import { getDinnerForDate, todayKey } from "@/domain/meal-plan";
import { getLocalSunsetHhMm, parseLatLon } from "@/domain/automations";
import { getCurrentWeather } from "@/domain/weather";

export default async function DashboardPage() {
  const { householdId } = await requireHousehold();
  const inventoryEnabled = await isModuleEnabled(
    householdId,
    ModuleId.INVENTORY,
  );
  const [notifications, todos, lowStock, household, mealPlanEnabled] =
    await Promise.all([
      getNotifications(householdId),
      getDashboardTodos(),
      inventoryEnabled ? getLowStockProducts() : Promise.resolve([]),
      prisma.household.findUnique({
        where: { id: householdId },
        select: { latitude: true, longitude: true, timezone: true },
      }),
      isModuleEnabled(householdId, ModuleId.MEAL_PLAN),
    ]);
  const t = await getTranslations("dashboard");
  const localeRaw = await getLocale();
  const bcp47 = localeToBcp47(isLocale(localeRaw) ? localeRaw : "en");

  // Sunset and weather share one coordinate guard: no coords, neither row.
  const timezone = household?.timezone ?? "Europe/Amsterdam";
  const coords = parseLatLon(household?.latitude, household?.longitude);
  const now = new Date();

  const [dinner, sunsetResult, weatherResult] = await Promise.all([
    mealPlanEnabled
      ? getDinnerForDate(householdId, todayKey(timezone, now))
      : Promise.resolve(null),
    coords
      ? Promise.resolve(
          getLocalSunsetHhMm({
            lat: coords.lat,
            lon: coords.lon,
            when: now,
            timezone,
          }),
        )
      : Promise.resolve(null),
    coords
      ? getCurrentWeather({
          lat: coords.lat,
          lon: coords.lon,
          timezone,
        })
      : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <TodayTile
            timezone={timezone}
            dinner={dinner}
            sunset={sunsetResult?.ok ? sunsetResult.sunsetHhMm : null}
            weather={weatherResult?.ok ? weatherResult.weather : null}
          />
        </div>
        <div className="lg:col-span-2">
          <HomeFeed notifications={notifications} />
        </div>
      </div>

      <div className={`grid gap-6 ${inventoryEnabled ? "md:grid-cols-2" : ""}`}>
        <Card className="flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckSquare className="h-5 w-5 text-primary" />
              {t("todoList")}
            </CardTitle>
          </CardHeader>
          <CardContent
            className={
              todos.length === 0 ? undefined : "min-h-0 max-h-80 overflow-y-auto"
            }
          >
            {todos.length === 0 ? (
              <EmptyState
                title={t("noChores")}
                description={t("noChoresHint")}
              />
            ) : (
              <ul className="space-y-2">
                {todos.map((chore) => (
                  <li key={chore.id}>
                    <Link
                      href="/tasks"
                      className="flex justify-between rounded-lg border p-3 text-sm transition-colors hover:bg-muted"
                    >
                      <div>
                        <p className="font-medium">{chore.title}</p>
                        {(chore.deadline ?? chore.nextDue) && (
                          <p className="text-muted-foreground">
                            {t("due", { date: formatDate(chore.deadline ?? chore.nextDue!, bcp47, { dateStyle: "medium" }) })}
                          </p>
                        )}
                      </div>
                      {chore.avgDuration && (
                        <span className="text-xs text-muted-foreground">{t("avgDuration", { minutes: chore.avgDuration })}</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {inventoryEnabled && (
          <Card className="flex flex-col">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                {t("lowStock")}
              </CardTitle>
            </CardHeader>
            <CardContent
              className={
                lowStock.length === 0 ? undefined : "min-h-0 max-h-80 overflow-y-auto"
              }
            >
              {lowStock.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("allStocked")}</p>
              ) : (
                <ul className="space-y-2">
                  {lowStock.map((p) => (
                    <li key={p.id}>
                      <Link
                        href="/inventory"
                        className="block rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm transition-colors hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/20 dark:hover:bg-amber-950/40"
                      >
                        {p.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
