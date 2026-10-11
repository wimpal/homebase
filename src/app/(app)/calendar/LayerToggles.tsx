"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@/components/ui/switch";
import { setCalendarLayerPreference } from "@/modules/calendar/actions";
import { cn } from "@/lib/utils";
import type { CalendarLayer, CalendarLayerPrefs } from "@/domain/calendar/types";
import { CHORE_DOT_CLASS, NATIVE_DOT_CLASS, feedDotClass } from "./feed-colors";

type LayerTogglesProps = {
  initial: CalendarLayerPrefs;
  labels: Record<CalendarLayer, string>;
  legend: string;
};

const LAYER_DOT_CLASSES: Record<CalendarLayer, string> = {
  native: NATIVE_DOT_CLASS,
  feeds: feedDotClass("sky"),
  chores: CHORE_DOT_CLASS,
};

export function LayerToggles({ initial, labels, legend }: LayerTogglesProps) {
  const [prefs, setPrefs] = useState(initial);
  const [, startTransition] = useTransition();
  const router = useRouter();

  function toggle(layer: CalendarLayer, enabled: boolean) {
    setPrefs((current) => ({ ...current, [layer]: enabled }));
    const formData = new FormData();
    formData.set("layer", layer);
    formData.set("enabled", enabled ? "true" : "false");
    startTransition(async () => {
      await setCalendarLayerPreference(formData);
      // Re-render the month grid / day panel for the new layer set.
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-md border px-3 py-2">
      <span className="text-xs font-medium text-muted-foreground">
        {legend}
      </span>
      {(Object.keys(labels) as CalendarLayer[]).map((layer) => (
        <label
          key={layer}
          className="flex cursor-pointer items-center gap-2 text-sm"
        >
          <Switch
            checked={prefs[layer]}
            onCheckedChange={(checked) => toggle(layer, checked)}
          />
          <span
            className={cn("size-2 rounded-full", LAYER_DOT_CLASSES[layer])}
          />
          {labels[layer]}
        </label>
      ))}
    </div>
  );
}
