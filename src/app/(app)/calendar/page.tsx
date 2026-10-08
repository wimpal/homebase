import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CollapsibleCreate } from "@/components/ui/collapsible-create";
import { ConfirmForm } from "@/components/ui/confirm-form";
import { EmptyState } from "@/components/ui/empty-state";
import {
  createCalendarEvent,
  getCalendarEvents,
  getEventLogs,
  logEvent,
  deleteCalendarEvent,
} from "@/modules/scheduling/actions";
import {
  getCalendarDeadlineChores,
  getCalendarOccurrences,
  getCalendarSubscriptions,
  getMyCalendarLayerPrefs,
} from "@/modules/calendar/actions";
import { requireHousehold } from "@/core/auth/session";
import { requireModule } from "@/core/modules/guard";
import { ModuleId } from "@prisma/client";
import { Calendar, MapPin, Home } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { formatDateTime } from "@/lib/utils";
import {
  addDaysKey,
  isDateKey,
  todayKey,
} from "@/lib/dates";
import {
  addMonthsKey,
  isMonthKey,
  monthGridDateKeys,
  monthKeyFromDateKey,
  overlappingDayKeys,
  paddedInstantRange,
} from "@/domain/calendar/dates";
import { isLocale, localeToBcp47 } from "@/i18n/config";
import { DayAgenda } from "./DayAgenda";
import { FeedsPanel } from "./FeedsPanel";
import { LayerToggles } from "./LayerToggles";
import { MonthGrid } from "./MonthGrid";
import { monthLabel } from "./format";
import type { CalendarDayItem } from "./types";

type CalendarSearchParams = {
  month?: string;
  day?: string;
};

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<CalendarSearchParams>;
}) {
  const { householdId, household } = await requireHousehold();
  await requireModule(householdId, ModuleId.CALENDAR);

  const sp = await searchParams;
  const tz = household.timezone;
  const today = todayKey(tz);
  const currentMonth = monthKeyFromDateKey(today);
  const month =
    sp.month && isMonthKey(sp.month) ? sp.month : currentMonth;
  const selectedDay =
    sp.day && isDateKey(sp.day) && monthKeyFromDateKey(sp.day) === month
      ? sp.day
      : month === currentMonth
        ? today
        : `${month}-01`;

  const gridKeys = monthGridDateKeys(month);
  const gridRange = paddedInstantRange(
    gridKeys[0],
    addDaysKey(gridKeys[gridKeys.length - 1], 1),
  );

  const [events, eventLogs, subscriptions, layerPrefs] = await Promise.all([
    getCalendarEvents(),
    getEventLogs(),
    getCalendarSubscriptions(),
    getMyCalendarLayerPrefs(),
  ]);

  const [occurrences, chores] = await Promise.all([
    layerPrefs.feeds
      ? getCalendarOccurrences(
          gridRange.from.toISOString(),
          gridRange.to.toISOString(),
        )
      : Promise.resolve([]),
    layerPrefs.chores
      ? getCalendarDeadlineChores(
          gridRange.from.toISOString(),
          gridRange.to.toISOString(),
        )
      : Promise.resolve([]),
  ]);

  const visibleDays = new Set(gridKeys);
  const buckets = new Map<string, CalendarDayItem[]>();
  const pushItem = (item: CalendarDayItem, dayKeys: string[]) => {
    for (const key of dayKeys) {
      if (!visibleDays.has(key)) continue;
      const list = buckets.get(key);
      if (list) {
        list.push(item);
      } else {
        buckets.set(key, [item]);
      }
    }
  };

  if (layerPrefs.native) {
    for (const event of events) {
      pushItem(
        {
          kind: "native",
          id: event.id,
          title: event.title,
          startAt: event.startAt,
          endAt: event.endAt,
          allDay: false,
          atHome: event.atHome,
          description: event.description,
          itemsNeeded: event.itemsNeeded,
          guests: event.guests.map((guest) => guest.name),
        },
        overlappingDayKeys(event.startAt, event.endAt, false, tz),
      );
    }
  }
  if (layerPrefs.feeds) {
    for (const occurrence of occurrences) {
      pushItem(
        {
          kind: "feed",
          id: occurrence.id,
          title: occurrence.title,
          startAt: occurrence.startAt,
          endAt: occurrence.endAt,
          allDay: occurrence.allDay,
          description: occurrence.description,
          location: occurrence.location,
          feedName: occurrence.feedName,
          feedColor: occurrence.feedColor,
        },
        overlappingDayKeys(
          occurrence.startAt,
          occurrence.endAt,
          occurrence.allDay,
          tz,
        ),
      );
    }
  }
  if (layerPrefs.chores) {
    for (const chore of chores) {
      if (!chore.deadline) continue;
      pushItem(
        {
          kind: "chore",
          id: chore.id,
          title: chore.title,
          startAt: chore.deadline,
          endAt: null,
          allDay: false,
          deadline: chore.deadline,
        },
        overlappingDayKeys(chore.deadline, null, false, tz),
      );
    }
  }

  for (const list of buckets.values()) {
    list.sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      return a.startAt.getTime() - b.startAt.getTime();
    });
  }

  const t = await getTranslations("calendar");
  const tc = await getTranslations("common");
  const localeRaw = await getLocale();
  const bcp47 = localeToBcp47(isLocale(localeRaw) ? localeRaw : "en");
  const selectedItems = buckets.get(selectedDay) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/calendar?month=${addMonthsKey(month, -1)}`}>
              {t("prevMonth")}
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/calendar?month=${currentMonth}&day=${today}`}>
              {t("todayBtn")}
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/calendar?month=${addMonthsKey(month, 1)}`}>
              {t("nextMonth")}
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {monthLabel(month, bcp47)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <LayerToggles
              initial={layerPrefs}
              labels={{
                native: t("layerNative"),
                feeds: t("layerFeeds"),
                chores: t("layerChores"),
              }}
              legend={t("legend")}
            />
            <MonthGrid
              month={month}
              gridKeys={gridKeys}
              today={today}
              selectedDay={selectedDay}
              buckets={buckets}
              bcp47={bcp47}
            />
            {buckets.size === 0 ? (
              <EmptyState
                title={t("monthEmpty")}
                description={t("monthEmptyHint")}
              />
            ) : null}
          </CardContent>
        </Card>

        <DayAgenda
          dayKey={selectedDay}
          items={selectedItems}
          tz={tz}
          bcp47={bcp47}
        />
      </div>

      <FeedsPanel subscriptions={subscriptions} tz={tz} bcp47={bcp47} />

      <Tabs defaultValue="events">
        <TabsList>
          <TabsTrigger value="events">{t("events")}</TabsTrigger>
          <TabsTrigger value="last-time">{t("lastTime")}</TabsTrigger>
        </TabsList>

        <TabsContent value="events" className="space-y-4">
          <CollapsibleCreate
            openLabel={t("createEvent")}
            cancelLabel={tc("cancelAdd")}
            defaultOpen={events.length === 0}
          >
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("createEvent")}</CardTitle>
              </CardHeader>
              <CardContent>
                <form
                  action={createCalendarEvent}
                  className="grid gap-3 md:grid-cols-2"
                >
                  <div className="grid gap-2">
                    <Label>{tc("title")}</Label>
                    <Input name="title" required />
                  </div>
                  <div className="grid gap-2">
                    <Label>{t("start")}</Label>
                    <Input name="startAt" type="datetime-local" required />
                  </div>
                  <div className="grid gap-2">
                    <Label>{t("end")}</Label>
                    <Input name="endAt" type="datetime-local" />
                  </div>
                  <div className="grid gap-2">
                    <Label>{t("reminderMinutes")}</Label>
                    <Input
                      name="reminderMinutes"
                      type="number"
                      defaultValue="60"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" name="atHome" id="atHome" defaultChecked />
                    <Label htmlFor="atHome">{tc("atHome")}</Label>
                  </div>
                  <div className="grid gap-2">
                    <Label>{t("itemsNeeded")}</Label>
                    <Input
                      name="itemsNeeded"
                      placeholder={t("itemsPlaceholder")}
                    />
                  </div>
                  <div className="grid gap-2 md:col-span-2">
                    <Label>{tc("description")}</Label>
                    <Textarea name="description" />
                  </div>
                  <div className="grid gap-2 md:col-span-2">
                    <Label>{t("guestsOnePerLine")}</Label>
                    <Textarea name="guests" />
                  </div>
                  <Button type="submit">{t("createEventBtn")}</Button>
                </form>
              </CardContent>
            </Card>
          </CollapsibleCreate>

          {events.length === 0 ? (
            <EmptyState title={t("noEvents")} description={t("noEventsHint")} />
          ) : (
            events.map((event) => (
              <Card key={event.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{event.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatDateTime(event.startAt, bcp47, { timeZone: tz })}
                        {event.endAt &&
                          ` - ${formatDateTime(event.endAt, bcp47, { timeZone: tz })}`}
                      </p>
                      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        {event.atHome ? (
                          <>
                            <Home className="h-3 w-3" /> {tc("atHome")}
                          </>
                        ) : (
                          <>
                            <MapPin className="h-3 w-3" /> {tc("outside")}
                          </>
                        )}
                      </p>
                      {event.itemsNeeded.length > 0 && (
                        <p className="mt-1 text-sm">
                          {tc("items")}: {event.itemsNeeded.join(", ")}
                        </p>
                      )}
                      {event.guests.length > 0 && (
                        <p className="text-sm text-muted-foreground">
                          {tc("guests")}:{" "}
                          {event.guests.map((g) => g.name).join(", ")}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Calendar className="h-5 w-5 text-primary" />
                      <ConfirmForm
                        action={deleteCalendarEvent}
                        message={t("confirmDeleteEvent")}
                      >
                        <input type="hidden" name="id" value={event.id} />
                        <Button type="submit" variant="destructive" size="sm">
                          {tc("delete")}
                        </Button>
                      </ConfirmForm>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="last-time" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("logEvent")}</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={logEvent} className="space-y-3">
                <div className="grid gap-2">
                  <Label>{t("whatHappened")}</Label>
                  <Input
                    name="title"
                    placeholder={t("whatHappenedPlaceholder")}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label>{t("when")}</Label>
                  <Input name="occurredAt" type="datetime-local" />
                </div>
                <div className="grid gap-2">
                  <Label>{tc("notes")}</Label>
                  <Textarea name="description" />
                </div>
                <Button type="submit">{tc("log")}</Button>
              </form>
            </CardContent>
          </Card>

          {eventLogs.length === 0 ? (
            <EmptyState title={t("noLogs")} description={t("noLogsHint")} />
          ) : (
            eventLogs.map((log) => (
              <Card key={log.id}>
                <CardContent className="p-4">
                  <p className="font-medium">{log.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {tc("last")}:{" "}
                    {formatDateTime(log.occurredAt, bcp47, { timeZone: tz })}
                  </p>
                  {log.description && (
                    <p className="text-sm">{log.description}</p>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
