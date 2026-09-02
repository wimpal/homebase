"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getTodayInfo } from "@/lib/utils";
import { CalendarDays } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

export function TodayTile() {
  const t = useTranslations("dashboard.today");
  const info = getTodayInfo();
  const chartData = [
    { name: "elapsed", value: info.percentOfYear },
    { name: "remaining", value: 100 - info.percentOfYear },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDays className="h-5 w-5 text-emerald-600" />
          {t("title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900">
            <p className="text-zinc-500">{t("dayOfYear")}</p>
            <p className="text-2xl font-bold">{info.dayOfYear}</p>
          </div>
          <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900">
            <p className="text-zinc-500">{t("weekOfYear")}</p>
            <p className="text-2xl font-bold">{info.weekOfYear}</p>
          </div>
          <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900">
            <p className="text-zinc-500">{t("daysLeft")}</p>
            <p className="text-2xl font-bold">{info.daysLeft}</p>
          </div>
          <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900">
            <p className="text-zinc-500">{t("yearProgress")}</p>
            <p className="text-2xl font-bold">{info.percentOfYear}%</p>
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-zinc-500">
            <span>{t("yearProgress")}</span>
            <span>{info.percentOfYear}%</span>
          </div>
          <Progress value={info.percentOfYear} />
        </div>
        <div className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                innerRadius={35}
                outerRadius={50}
                startAngle={90}
                endAngle={-270}
              >
                <Cell fill="#059669" />
                <Cell fill="#e4e4e7" />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
