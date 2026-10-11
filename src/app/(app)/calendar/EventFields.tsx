"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTranslations } from "next-intl";

type EventFieldsProps = {
  /** Unique prefix so two forms on one page do not share DOM ids. */
  idPrefix: string;
  /** Prefill for the start input (`YYYY-MM-DDTHH:mm`). */
  defaultStart?: string;
  /** Label for the submit button. */
  submitLabel: string;
};

/**
 * Create-event field set shared by the Events tab and the selected-day panel,
 * so the two forms cannot drift. Submit lives here; the caller supplies the
 * surrounding FormAction.
 */
export function EventFields({
  idPrefix,
  defaultStart,
  submitLabel,
}: EventFieldsProps) {
  const t = useTranslations("calendar");
  const tc = useTranslations("common");

  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-title`}>{tc("title")}</Label>
        <Input id={`${idPrefix}-title`} name="title" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-start`}>{t("start")}</Label>
        <Input
          id={`${idPrefix}-start`}
          name="startAt"
          type="datetime-local"
          defaultValue={defaultStart}
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-end`}>{t("end")}</Label>
        <Input id={`${idPrefix}-end`} name="endAt" type="datetime-local" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-reminder`}>{t("reminderMinutes")}</Label>
        <Input
          id={`${idPrefix}-reminder`}
          name="reminderMinutes"
          type="number"
          defaultValue="60"
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          name="atHome"
          id={`${idPrefix}-atHome`}
          defaultChecked
        />
        <Label htmlFor={`${idPrefix}-atHome`}>{tc("atHome")}</Label>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-items`}>{t("itemsNeeded")}</Label>
        <Input
          id={`${idPrefix}-items`}
          name="itemsNeeded"
          placeholder={t("itemsPlaceholder")}
        />
      </div>
      <div className="grid gap-2 md:col-span-2">
        <Label htmlFor={`${idPrefix}-description`}>{tc("description")}</Label>
        <Textarea id={`${idPrefix}-description`} name="description" />
      </div>
      <div className="grid gap-2 md:col-span-2">
        <Label htmlFor={`${idPrefix}-guests`}>{t("guestsOnePerLine")}</Label>
        <Textarea id={`${idPrefix}-guests`} name="guests" />
      </div>
      <Button type="submit">{submitLabel}</Button>
    </>
  );
}
