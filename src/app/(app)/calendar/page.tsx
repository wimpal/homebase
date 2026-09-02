import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getCalendarEvents, createCalendarEvent, getEventLogs, logEvent } from "@/modules/scheduling/actions";
import { requireHousehold } from "@/core/auth/session";
import { requireModule } from "@/core/modules/guard";
import { ModuleId } from "@prisma/client";
import { Calendar, MapPin, Home } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { formatDateTime } from "@/lib/utils";
import { isLocale, localeToBcp47 } from "@/i18n/config";

export default async function CalendarPage() {
  const { householdId } = await requireHousehold();
  await requireModule(householdId, ModuleId.CALENDAR);
  const [events, eventLogs] = await Promise.all([getCalendarEvents(), getEventLogs()]);
  const t = await getTranslations("calendar");
  const tc = await getTranslations("common");
  const localeRaw = await getLocale();
  const bcp47 = localeToBcp47(isLocale(localeRaw) ? localeRaw : "en");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-zinc-500">{t("subtitle")}</p>
      </div>

      <Tabs defaultValue="events">
        <TabsList>
          <TabsTrigger value="events">{t("events")}</TabsTrigger>
          <TabsTrigger value="last-time">{t("lastTime")}</TabsTrigger>
        </TabsList>

        <TabsContent value="events" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">{t("createEvent")}</CardTitle></CardHeader>
            <CardContent>
              <form action={createCalendarEvent} className="grid gap-3 md:grid-cols-2">
                <div><Label>{tc("title")}</Label><Input name="title" required /></div>
                <div><Label>{t("start")}</Label><Input name="startAt" type="datetime-local" required /></div>
                <div><Label>{t("end")}</Label><Input name="endAt" type="datetime-local" /></div>
                <div><Label>{t("reminderMinutes")}</Label><Input name="reminderMinutes" type="number" defaultValue="60" /></div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" name="atHome" id="atHome" defaultChecked />
                  <Label htmlFor="atHome">{tc("atHome")}</Label>
                </div>
                <div><Label>{t("itemsNeeded")}</Label><Input name="itemsNeeded" placeholder={t("itemsPlaceholder")} /></div>
                <div className="md:col-span-2"><Label>{tc("description")}</Label><Textarea name="description" /></div>
                <div className="md:col-span-2"><Label>{t("guestsOnePerLine")}</Label><Textarea name="guests" /></div>
                <Button type="submit">{t("createEventBtn")}</Button>
              </form>
            </CardContent>
          </Card>

          {events.map((event) => (
            <Card key={event.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium">{event.title}</p>
                    <p className="text-sm text-zinc-500">
                      {formatDateTime(event.startAt, bcp47)}
                      {event.endAt && ` - ${formatDateTime(event.endAt, bcp47)}`}
                    </p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-zinc-400">
                      {event.atHome ? <><Home className="h-3 w-3" /> {tc("atHome")}</> : <><MapPin className="h-3 w-3" /> {tc("outside")}</>}
                    </p>
                    {event.itemsNeeded.length > 0 && (
                      <p className="mt-1 text-sm">{tc("items")}: {event.itemsNeeded.join(", ")}</p>
                    )}
                    {event.guests.length > 0 && (
                      <p className="text-sm text-zinc-500">{tc("guests")}: {event.guests.map((g) => g.name).join(", ")}</p>
                    )}
                  </div>
                  <Calendar className="h-5 w-5 text-emerald-600" />
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="last-time" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">{t("logEvent")}</CardTitle></CardHeader>
            <CardContent>
              <form action={logEvent} className="space-y-3">
                <div><Label>{t("whatHappened")}</Label><Input name="title" placeholder={t("whatHappenedPlaceholder")} required /></div>
                <div><Label>{t("when")}</Label><Input name="occurredAt" type="datetime-local" /></div>
                <div><Label>{tc("notes")}</Label><Textarea name="description" /></div>
                <Button type="submit">{tc("log")}</Button>
              </form>
            </CardContent>
          </Card>

          {eventLogs.map((log) => (
            <Card key={log.id}>
              <CardContent className="p-4">
                <p className="font-medium">{log.title}</p>
                <p className="text-sm text-zinc-500">{tc("last")}: {formatDateTime(log.occurredAt, bcp47)}</p>
                {log.description && <p className="text-sm">{log.description}</p>}
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
