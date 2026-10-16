"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FormAction } from "@/components/ui/form-action";
import { createCalendarEvent } from "@/modules/scheduling/actions";
import { EventFields } from "./EventFields";

type DayAgendaCreateProps = {
  /** Household-local `YYYY-MM-DD` of the selected day. */
  dayKey: string;
};

/**
 * "Add event" control at the top of the selected-day panel. Opens the shared
 * create-event form prefilled with the selected day, closes on success, and
 * refreshes so the new event shows immediately in the panel and month grid.
 */
export function DayAgendaCreate({ dayKey }: DayAgendaCreateProps) {
  const t = useTranslations("calendar");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => setOpen(true)}
      >
        {t("addEvent")}
      </Button>
    );
  }

  return (
    <Card>
      <CardContent className="pt-4">
        <FormAction
          action={createCalendarEvent}
          actionName="calendar.createEvent"
          resetOnSuccess
          onSuccess={() => setOpen(false)}
          className="grid gap-3 md:grid-cols-2"
        >
          <EventFields
            idPrefix="day-event"
            defaultStart={`${dayKey}T09:00`}
            submitLabel={t("createEventBtn")}
          />
          <div className="md:col-span-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
            >
              {tc("cancelAdd")}
            </Button>
          </div>
        </FormAction>
      </CardContent>
    </Card>
  );
}
