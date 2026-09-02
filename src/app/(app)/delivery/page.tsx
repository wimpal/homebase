import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getDeliveries, createDelivery, updateDeliveryStatus } from "@/modules/social/actions";
import { requireHousehold } from "@/core/auth/session";
import { requireModule } from "@/core/modules/guard";
import { ModuleId } from "@prisma/client";
import { Package, ExternalLink } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { formatDate, formatDateTime } from "@/lib/utils";
import { isLocale, localeToBcp47 } from "@/i18n/config";

const statuses = ["PENDING", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "EXCEPTION"] as const;

const statusKeys: Record<(typeof statuses)[number], string> = {
  PENDING: "statusPending",
  IN_TRANSIT: "statusInTransit",
  OUT_FOR_DELIVERY: "statusOutForDelivery",
  DELIVERED: "statusDelivered",
  EXCEPTION: "statusException",
};

export default async function DeliveryPage() {
  const { householdId } = await requireHousehold();
  await requireModule(householdId, ModuleId.DELIVERY);
  const deliveries = await getDeliveries();
  const t = await getTranslations("delivery");
  const tc = await getTranslations("common");
  const localeRaw = await getLocale();
  const bcp47 = localeToBcp47(isLocale(localeRaw) ? localeRaw : "en");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-zinc-500">{t("subtitle")}</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{t("addPackage")}</CardTitle></CardHeader>
        <CardContent>
          <form action={createDelivery} className="grid gap-3 md:grid-cols-2">
            <div><Label>{tc("description")}</Label><Input name="description" placeholder="Amazon order" /></div>
            <div><Label>{t("carrier")}</Label><Input name="carrier" placeholder={t("carrierPlaceholder")} /></div>
            <div><Label>{t("trackingNumber")}</Label><Input name="trackingNumber" /></div>
            <div><Label>{t("trackingUrl")}</Label><Input name="trackingUrl" type="url" /></div>
            <div><Label>{t("expectedDate")}</Label><Input name="expectedDate" type="date" /></div>
            <div><Label>{t("earliestTime")}</Label><Input name="earliestTime" type="datetime-local" /></div>
            <div><Label>{t("latestTime")}</Label><Input name="latestTime" type="datetime-local" /></div>
            <Button type="submit">{t("addPackageBtn")}</Button>
          </form>
        </CardContent>
      </Card>

      {deliveries.map((d) => (
        <Card key={d.id}>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="flex items-center gap-2 font-medium">
                <Package className="h-4 w-4" />
                {d.description || tc("package")}
              </p>
              <p className="text-sm text-zinc-500">
                {d.carrier} {d.trackingNumber && `· ${d.trackingNumber}`}
              </p>
              {d.expectedDate && (
                <p className="text-sm">{tc("expected")}: {formatDate(d.expectedDate, bcp47, { dateStyle: "medium" })}</p>
              )}
              {d.earliestTime && (
                <p className="text-xs text-zinc-400">
                  {tc("window")}: {formatDateTime(d.earliestTime, bcp47, { timeStyle: "short" })}
                  {d.latestTime && ` - ${formatDateTime(d.latestTime, bcp47, { timeStyle: "short" })}`}
                </p>
              )}
              <span className="mt-1 inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-xs dark:bg-zinc-800">
                {t(statusKeys[d.status as keyof typeof statusKeys] ?? "statusPending")}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {d.trackingUrl && (
                <a href={d.trackingUrl} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm">
                    <ExternalLink className="mr-1 h-3 w-3" /> {tc("track")}
                  </Button>
                </a>
              )}
              <form action={updateDeliveryStatus} className="flex gap-1">
                <input type="hidden" name="id" value={d.id} />
                <select name="status" className="rounded border px-2 text-xs">
                  {statuses.map((s) => (
                    <option key={s} value={s}>{t(statusKeys[s])}</option>
                  ))}
                </select>
                <Button type="submit" size="sm" variant="ghost">{tc("update")}</Button>
              </form>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
