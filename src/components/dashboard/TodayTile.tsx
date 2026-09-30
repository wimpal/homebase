import Link from "next/link";
import type { ReactNode } from "react";
import {
  CalendarDays,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Cloud,
  Sun,
  Sunset,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getTodayInfo } from "@/lib/utils";
import type { MealPlanDayDto } from "@/domain/meal-plan/types";
import type { WeatherKind } from "@/domain/weather";

const WEATHER_ICONS: Record<WeatherKind, LucideIcon> = {
  clear: Sun,
  partlyCloudy: CloudSun,
  overcast: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  snow: CloudSnow,
  showers: CloudRain,
  thunderstorm: CloudLightning,
};

export interface TodayTileWeather {
  temperatureC: number;
  kind: WeatherKind;
  labelKey: string;
  highC: number | null;
  lowC: number | null;
}

export interface TodayTileProps {
  /** IANA household timezone — drives the calendar date, not the server's. */
  timezone: string;
  dinner: MealPlanDayDto | null;
  /** Local sunset as `HH:MM`, or null when the household has no coordinates. */
  sunset: string | null;
  weather: TodayTileWeather | null;
}

export async function TodayTile({
  timezone,
  dinner,
  sunset,
  weather,
}: TodayTileProps) {
  const t = await getTranslations("dashboard.today");
  const info = getTodayInfo(new Date(), timezone);

  const rows: Array<{ key: string; icon: LucideIcon; node: ReactNode }> = [];

  if (weather) {
    const Icon = WEATHER_ICONS[weather.kind] ?? Cloud;
    const range =
      weather.highC !== null && weather.lowC !== null
        ? ` · ${t("weatherRange", {
            high: Math.round(weather.highC),
            low: Math.round(weather.lowC),
          })}`
        : "";
    rows.push({
      key: "weather",
      icon: Icon,
      node: (
        <>
          <span className="truncate">{t(`weatherCodes.${weather.labelKey}`)}</span>
          <span className="shrink-0 tabular-nums">
            {Math.round(weather.temperatureC)}°C
            {/* High/low is the first thing to drop on a narrow tile. */}
            <span className="@max-2xs:hidden">{range}</span>
          </span>
        </>
      ),
    });
  }

  if (sunset) {
    rows.push({
      key: "sunset",
      icon: Sunset,
      node: (
        <>
          <span className="truncate">{t("sunset")}</span>
          <span className="shrink-0 tabular-nums">{sunset}</span>
        </>
      ),
    });
  }

  if (dinner?.title) {
    rows.push({
      key: "dinner",
      icon: UtensilsCrossed,
      node: (
        <>
          <span className="truncate">{t("dinner")}</span>
          <Link
            href={`/recipes?q=${encodeURIComponent(dinner.title)}`}
            className="truncate font-medium text-primary hover:underline"
          >
            {dinner.title}
          </Link>
        </>
      ),
    });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDays className="h-5 w-5 text-primary" />
          {t("title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid shrink-0 grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-background p-3">
            <p className="text-muted-foreground">{t("dayOfYear")}</p>
            <p className="text-2xl font-bold">{info.dayOfYear}</p>
          </div>
          <div className="rounded-lg bg-background p-3">
            <p className="text-muted-foreground">{t("weekOfYear")}</p>
            <p className="text-2xl font-bold">{info.weekOfYear}</p>
          </div>
          <div className="rounded-lg bg-background p-3">
            <p className="text-muted-foreground">{t("daysLeft")}</p>
            <p className="text-2xl font-bold">{info.daysLeft}</p>
          </div>
          <div className="rounded-lg bg-background p-3">
            <p className="text-muted-foreground">{t("yearProgress")}</p>
            <p className="text-2xl font-bold">{info.percentOfYear}%</p>
          </div>
        </div>
        <div className="shrink-0 space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{t("yearProgress")}</span>
            <span>{info.percentOfYear}%</span>
          </div>
          <Progress value={info.percentOfYear} />
        </div>
        {rows.length > 0 && (
          <div className="@container min-h-0 space-y-2 overflow-hidden border-t pt-3">
            {rows.map((row) => {
              const Icon = row.icon;
              return (
                <div
                  key={row.key}
                  className="flex items-center gap-2 text-sm"
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                    {row.node}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
