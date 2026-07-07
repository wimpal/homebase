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

export default async function CalendarPage() {
  const { householdId } = await requireHousehold();
  await requireModule(householdId, ModuleId.CALENDAR);
  const [events, eventLogs] = await Promise.all([getCalendarEvents(), getEventLogs()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Calendar</h1>
        <p className="text-zinc-500">Events, guests, and preparation</p>
      </div>

      <Tabs defaultValue="events">
        <TabsList>
          <TabsTrigger value="events">Events</TabsTrigger>
          <TabsTrigger value="last-time">Last Time</TabsTrigger>
        </TabsList>

        <TabsContent value="events" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Create Event</CardTitle></CardHeader>
            <CardContent>
              <form action={createCalendarEvent} className="grid gap-3 md:grid-cols-2">
                <div><Label>Title</Label><Input name="title" required /></div>
                <div><Label>Start</Label><Input name="startAt" type="datetime-local" required /></div>
                <div><Label>End</Label><Input name="endAt" type="datetime-local" /></div>
                <div><Label>Reminder (minutes before)</Label><Input name="reminderMinutes" type="number" defaultValue="60" /></div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" name="atHome" id="atHome" defaultChecked />
                  <Label htmlFor="atHome">At home</Label>
                </div>
                <div><Label>Items needed (comma-separated)</Label><Input name="itemsNeeded" placeholder="chairs, snacks" /></div>
                <div className="md:col-span-2"><Label>Description</Label><Textarea name="description" /></div>
                <div className="md:col-span-2"><Label>Guests (one per line)</Label><Textarea name="guests" /></div>
                <Button type="submit">Create Event</Button>
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
                      {new Date(event.startAt).toLocaleString()}
                      {event.endAt && ` - ${new Date(event.endAt).toLocaleString()}`}
                    </p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-zinc-400">
                      {event.atHome ? <><Home className="h-3 w-3" /> At home</> : <><MapPin className="h-3 w-3" /> Outside</>}
                    </p>
                    {event.itemsNeeded.length > 0 && (
                      <p className="mt-1 text-sm">Items: {event.itemsNeeded.join(", ")}</p>
                    )}
                    {event.guests.length > 0 && (
                      <p className="text-sm text-zinc-500">Guests: {event.guests.map((g) => g.name).join(", ")}</p>
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
            <CardHeader><CardTitle className="text-base">Log Event</CardTitle></CardHeader>
            <CardContent>
              <form action={logEvent} className="space-y-3">
                <div><Label>What happened?</Label><Input name="title" placeholder="Changed air filter" required /></div>
                <div><Label>When</Label><Input name="occurredAt" type="datetime-local" /></div>
                <div><Label>Notes</Label><Textarea name="description" /></div>
                <Button type="submit">Log</Button>
              </form>
            </CardContent>
          </Card>

          {eventLogs.map((log) => (
            <Card key={log.id}>
              <CardContent className="p-4">
                <p className="font-medium">{log.title}</p>
                <p className="text-sm text-zinc-500">Last: {new Date(log.occurredAt).toLocaleString()}</p>
                {log.description && <p className="text-sm">{log.description}</p>}
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
