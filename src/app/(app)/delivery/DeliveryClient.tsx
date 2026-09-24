"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CollapsibleCreate } from "@/components/ui/collapsible-create";
import { ConfirmFormAction } from "@/components/ui/confirm-form-action";
import { FormAction } from "@/components/ui/form-action";
import { EmptyState } from "@/components/ui/empty-state";
import {
  createDelivery,
  updateDeliveryStatus,
  deleteDelivery,
} from "@/modules/social/actions";
import { Package, ExternalLink } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

const statuses = [
  "PENDING",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "EXCEPTION",
] as const;

const statusKeys: Record<(typeof statuses)[number], string> = {
  PENDING: "statusPending",
  IN_TRANSIT: "statusInTransit",
  OUT_FOR_DELIVERY: "statusOutForDelivery",
  DELIVERED: "statusDelivered",
  EXCEPTION: "statusException",
};

type Delivery = {
  id: string;
  description: string | null;
  carrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  expectedDate: Date | null;
  earliestTime: Date | null;
  latestTime: Date | null;
  status: string;
};

export function DeliveryClient({ deliveries }: { deliveries: Delivery[] }) {
  const t = useTranslations("delivery");
  const tc = useTranslations("common");
  const format = useFormatter();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-zinc-500">{t("subtitle")}</p>
      </div>

      <CollapsibleCreate
        openLabel={t("addPackage")}
        cancelLabel={tc("cancelAdd")}
        defaultOpen={deliveries.length === 0}
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("addPackage")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createDelivery} className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>{tc("description")}</Label>
                <Input name="description" placeholder="Amazon order" />
              </div>
              <div>
                <Label>{t("carrier")}</Label>
                <Input name="carrier" placeholder={t("carrierPlaceholder")} />
              </div>
              <div>
                <Label>{t("trackingNumber")}</Label>
                <Input name="trackingNumber" />
              </div>
              <div>
                <Label>{t("trackingUrl")}</Label>
                <Input name="trackingUrl" type="url" />
              </div>
              <div>
                <Label>{t("expectedDate")}</Label>
                <Input name="expectedDate" type="date" />
              </div>
              <div>
                <Label>{t("earliestTime")}</Label>
                <Input name="earliestTime" type="datetime-local" />
              </div>
              <div>
                <Label>{t("latestTime")}</Label>
                <Input name="latestTime" type="datetime-local" />
              </div>
              <Button type="submit">{t("addPackageBtn")}</Button>
            </form>
          </CardContent>
        </Card>
      </CollapsibleCreate>

      {deliveries.length === 0 ? (
        <EmptyState message={t("noPackages")} />
      ) : (
        deliveries.map((d) => (
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
                  <p className="text-sm">
                    {tc("expected")}:{" "}
                    {format.dateTime(d.expectedDate, { dateStyle: "medium" })}
                  </p>
                )}
                {d.earliestTime && (
                  <p className="text-xs text-zinc-400">
                    {tc("window")}:{" "}
                    {format.dateTime(d.earliestTime, { timeStyle: "short" })}
                    {d.latestTime &&
                      ` - ${format.dateTime(d.latestTime, { timeStyle: "short" })}`}
                  </p>
                )}
                <span className="mt-1 inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-xs dark:bg-zinc-800">
                  {t(
                    statusKeys[d.status as keyof typeof statusKeys] ??
                      "statusPending",
                  )}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {d.trackingUrl && (
                  <a
                    href={d.trackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button variant="outline" size="sm">
                      <ExternalLink className="mr-1 h-3 w-3" /> {tc("track")}
                    </Button>
                  </a>
                )}
                <FormAction
                  action={updateDeliveryStatus}
                  actionName="updateDeliveryStatus"
                  className="flex gap-1"
                  diagnosticsFromForm={(fd) => ({
                    status: String(fd.get("status") ?? ""),
                  })}
                >
                  <input type="hidden" name="id" value={d.id} />
                  <select
                    name="status"
                    className="rounded border px-2 text-xs"
                    defaultValue={d.status}
                  >
                    {statuses.map((s) => (
                      <option key={s} value={s}>
                        {t(statusKeys[s])}
                      </option>
                    ))}
                  </select>
                  <Button type="submit" size="sm" variant="ghost">
                    {tc("update")}
                  </Button>
                </FormAction>
                <ConfirmFormAction
                  action={deleteDelivery}
                  actionName="deleteDelivery"
                  message={t("confirmDelete")}
                >
                  <input type="hidden" name="id" value={d.id} />
                  <Button type="submit" variant="destructive" size="sm">
                    {tc("delete")}
                  </Button>
                </ConfirmFormAction>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
