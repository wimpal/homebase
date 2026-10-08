import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CollapsibleCreate } from "@/components/ui/collapsible-create";
import { ConfirmForm } from "@/components/ui/confirm-form";
import { EmptyState } from "@/components/ui/empty-state";
import { FormAction } from "@/components/ui/form-action";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createCalendarSubscription,
  deleteCalendarSubscription,
  setCalendarSubscriptionEnabled,
  syncCalendarSubscriptionNow,
  updateCalendarSubscription,
} from "@/modules/calendar/actions";
import { CALENDAR_FEED_COLORS } from "@/domain/calendar/types";
import { formatDateTime } from "@/lib/utils";
import { getTranslations } from "next-intl/server";
import { feedDotClass } from "./feed-colors";
import { cn } from "@/lib/utils";
import type { CalendarSubscriptionRow } from "@/domain/calendar/types";

type FeedsPanelProps = {
  subscriptions: CalendarSubscriptionRow[];
  tz: string;
  bcp47: string;
};

const COLOR_LABEL_KEYS: Record<string, string> = {
  emerald: "colorEmerald",
  sky: "colorSky",
  violet: "colorViolet",
  amber: "colorAmber",
  rose: "colorRose",
  teal: "colorTeal",
};

export async function FeedsPanel({ subscriptions, tz, bcp47 }: FeedsPanelProps) {
  const t = await getTranslations("calendar");
  const tc = await getTranslations("common");

  const colorSelect = (defaultValue: string) => (
    <Select name="color" defaultValue={defaultValue}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {CALENDAR_FEED_COLORS.map((color) => (
          <SelectItem key={color} value={color}>
            <span className="flex items-center gap-2">
              <span
                className={cn("size-2.5 rounded-full", feedDotClass(color))}
              />
              {t(COLOR_LABEL_KEYS[color])}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{t("subscriptions")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("subscriptionsHint")}
        </p>
      </div>

      <CollapsibleCreate
        openLabel={t("addSubscription")}
        cancelLabel={tc("cancelAdd")}
        defaultOpen={subscriptions.length === 0}
      >
        <Card>
          <CardContent className="pt-6">
            <FormAction
              action={createCalendarSubscription}
              actionName="calendar.createSubscription"
              className="grid gap-3 md:grid-cols-2"
            >
              <div className="grid gap-2">
                <Label htmlFor="feed-name">{t("feedName")}</Label>
                <Input
                  id="feed-name"
                  name="name"
                  required
                  placeholder={t("feedNamePlaceholder")}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="feed-color">{t("feedColor")}</Label>
                {colorSelect("emerald")}
              </div>
              <div className="grid gap-2 md:col-span-2">
                <Label htmlFor="feed-url">{t("feedUrl")}</Label>
                <Input
                  id="feed-url"
                  name="url"
                  required
                  placeholder={t("feedUrlPlaceholder")}
                />
              </div>
              <div className="md:col-span-2">
                <Button type="submit">{t("feedAdd")}</Button>
              </div>
            </FormAction>
          </CardContent>
        </Card>
      </CollapsibleCreate>

      {subscriptions.length === 0 ? (
        <EmptyState
          title={t("noSubscriptions")}
          description={t("noSubscriptionsHint")}
        />
      ) : (
        subscriptions.map((subscription) => (
          <Card key={subscription.id}>
            <CardContent className="space-y-3 pt-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-0.5">
                  <p className="flex items-center gap-2 font-medium">
                    <span
                      className={cn(
                        "size-2.5 shrink-0 rounded-full",
                        feedDotClass(subscription.color),
                      )}
                    />
                    <span className="truncate">{subscription.name}</span>
                    {!subscription.enabled && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {t("feedDisabled")}
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {subscription.url}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {subscription.lastSyncedAt
                      ? t("feedLastSynced", {
                          date: formatDateTime(
                            subscription.lastSyncedAt,
                            bcp47,
                            { timeZone: tz, dateStyle: "medium", timeStyle: "short" },
                          ),
                        })
                      : t("feedNeverSynced")}
                  </p>
                  {subscription.lastSyncError && (
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      {t("feedSyncError", { error: subscription.lastSyncError })}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <FormAction
                  action={syncCalendarSubscriptionNow}
                  actionName="calendar.syncNow"
                >
                  <input type="hidden" name="id" value={subscription.id} />
                  <Button type="submit" variant="outline" size="sm">
                    {t("feedSyncNow")}
                  </Button>
                </FormAction>

                <form action={setCalendarSubscriptionEnabled}>
                  <input type="hidden" name="id" value={subscription.id} />
                  <input
                    type="hidden"
                    name="enabled"
                    value={subscription.enabled ? "false" : "true"}
                  />
                  <Button type="submit" variant="outline" size="sm">
                    {subscription.enabled ? t("feedDisable") : t("feedEnable")}
                  </Button>
                </form>

                <ConfirmForm
                  action={deleteCalendarSubscription}
                  message={t("confirmDeleteSubscription")}
                >
                  <input type="hidden" name="id" value={subscription.id} />
                  <Button type="submit" variant="destructive" size="sm">
                    {tc("delete")}
                  </Button>
                </ConfirmForm>
              </div>

              <details className="rounded-md border p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  {t("feedEdit")}
                </summary>
                <FormAction
                  action={updateCalendarSubscription}
                  actionName="calendar.updateSubscription"
                  className="mt-3 grid gap-3 md:grid-cols-2"
                >
                  <input type="hidden" name="id" value={subscription.id} />
                  <div className="grid gap-2">
                    <Label htmlFor={`feed-name-${subscription.id}`}>
                      {t("feedName")}
                    </Label>
                    <Input
                      id={`feed-name-${subscription.id}`}
                      name="name"
                      defaultValue={subscription.name}
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>{t("feedColor")}</Label>
                    {colorSelect(subscription.color)}
                  </div>
                  <div className="md:col-span-2">
                    <Button type="submit" variant="outline" size="sm">
                      {t("feedSave")}
                    </Button>
                  </div>
                </FormAction>
              </details>
            </CardContent>
          </Card>
        ))
      )}
    </section>
  );
}
