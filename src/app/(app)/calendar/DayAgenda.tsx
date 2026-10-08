import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmForm } from "@/components/ui/confirm-form";
import { EmptyState } from "@/components/ui/empty-state";
import { FormAction } from "@/components/ui/form-action";
import { completeCalendarChore } from "@/modules/calendar/actions";
import { deleteCalendarEvent } from "@/modules/scheduling/actions";
import { formatDateTime } from "@/lib/utils";
import { Home, MapPin } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { feedChipClass, feedDotClass, CHORE_DOT_CLASS, NATIVE_DOT_CLASS } from "./feed-colors";
import { dayHeading } from "./format";
import { cn } from "@/lib/utils";
import type { CalendarDayItem } from "./types";

type DayAgendaProps = {
  dayKey: string;
  items: CalendarDayItem[];
  tz: string;
  bcp47: string;
};

export async function DayAgenda({ dayKey, items, tz, bcp47 }: DayAgendaProps) {
  const t = await getTranslations("calendar");
  const tc = await getTranslations("common");

  const timeLabel = (date: Date) =>
    formatDateTime(date, bcp47, {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {dayHeading(dayKey, bcp47, tz)}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <EmptyState title={t("dayEmpty")} description={t("dayEmptyHint")} />
        ) : (
          items.map((item, index) => {
            if (item.kind === "native") {
              return (
                <div
                  key={`native-${item.id}-${index}`}
                  className="flex items-start justify-between gap-3 rounded-md border p-3"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="flex items-center gap-1.5 font-medium">
                      <span
                        className={cn("size-2 rounded-full", NATIVE_DOT_CLASS)}
                      />
                      {item.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {timeLabel(item.startAt)}
                      {item.endAt && item.endAt > item.startAt
                        ? ` – ${timeLabel(item.endAt)}`
                        : ""}
                    </p>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      {item.atHome ? (
                        <>
                          <Home className="h-3 w-3" /> {tc("atHome")}
                        </>
                      ) : (
                        <>
                          <MapPin className="h-3 w-3" /> {tc("outside")}
                        </>
                      )}
                    </p>
                    {item.itemsNeeded.length > 0 && (
                      <p className="text-xs">
                        {tc("items")}: {item.itemsNeeded.join(", ")}
                      </p>
                    )}
                    {item.guests.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {tc("guests")}: {item.guests.join(", ")}
                      </p>
                    )}
                    {item.description && (
                      <p className="text-xs text-muted-foreground">
                        {item.description}
                      </p>
                    )}
                  </div>
                  <ConfirmForm
                    action={deleteCalendarEvent}
                    message={t("confirmDeleteEvent")}
                  >
                    <input type="hidden" name="id" value={item.id} />
                    <Button type="submit" variant="destructive" size="sm">
                      {tc("delete")}
                    </Button>
                  </ConfirmForm>
                </div>
              );
            }

            if (item.kind === "feed") {
              return (
                <div
                  key={`feed-${item.id}-${index}`}
                  className="space-y-0.5 rounded-md border p-3"
                >
                  <p className="flex items-center gap-1.5 font-medium">
                    <span
                      className={cn("size-2 rounded-full", feedDotClass(item.feedColor))}
                    />
                    {item.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.allDay ? t("allDay") : timeLabel(item.startAt)}
                    {!item.allDay && item.endAt && item.endAt > item.startAt
                      ? ` – ${timeLabel(item.endAt)}`
                      : ""}
                  </p>
                  <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-medium",
                        feedChipClass(item.feedColor),
                      )}
                    >
                      {item.feedName}
                    </span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                      {t("feedReadOnly")}
                    </span>
                  </p>
                  {item.location && (
                    <p className="text-xs text-muted-foreground">
                      {item.location}
                    </p>
                  )}
                  {item.description && (
                    <p className="line-clamp-3 text-xs text-muted-foreground">
                      {item.description}
                    </p>
                  )}
                </div>
              );
            }

            return (
              <div
                key={`chore-${item.id}-${index}`}
                className="flex items-start justify-between gap-3 rounded-md border p-3"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="flex items-center gap-1.5 font-medium">
                    <span className={cn("size-2 rounded-full", CHORE_DOT_CLASS)} />
                    {item.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("deadline")}: {timeLabel(item.deadline)}
                  </p>
                </div>
                <FormAction
                  action={completeCalendarChore}
                  actionName="calendar.completeChore"
                >
                  <input type="hidden" name="choreId" value={item.id} />
                  <Button type="submit" variant="outline" size="sm">
                    {t("completeChore")}
                  </Button>
                </FormAction>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
