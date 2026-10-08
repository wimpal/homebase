/**
 * Per-Account calendar layer preferences (T-139), stored in the generic
 * `Preference` table (userId + householdId + key). Missing row = enabled.
 */

import { prisma } from "@/core/db";
import {
  CALENDAR_LAYERS,
  DEFAULT_CALENDAR_LAYER_PREFS,
  type CalendarLayer,
  type CalendarLayerPrefs,
} from "./types";

export const CALENDAR_LAYER_PREF_KEYS: Record<CalendarLayer, string> = {
  native: "calendar.layer.native",
  feeds: "calendar.layer.feeds",
  chores: "calendar.layer.chores",
};

export async function getCalendarLayerPrefs(
  userId: string,
  householdId: string,
): Promise<CalendarLayerPrefs> {
  const rows = await prisma.preference.findMany({
    where: {
      userId,
      householdId,
      key: { in: Object.values(CALENDAR_LAYER_PREF_KEYS) },
    },
    select: { key: true, value: true },
  });
  const byKey = new Map(rows.map((row) => [row.key, row.value]));

  const prefs = { ...DEFAULT_CALENDAR_LAYER_PREFS };
  for (const layer of CALENDAR_LAYERS) {
    prefs[layer] = byKey.get(CALENDAR_LAYER_PREF_KEYS[layer]) !== "off";
  }
  return prefs;
}

export async function setCalendarLayerPref(
  userId: string,
  householdId: string,
  layer: CalendarLayer,
  enabled: boolean,
): Promise<void> {
  const key = CALENDAR_LAYER_PREF_KEYS[layer];
  const value = enabled ? "on" : "off";
  await prisma.preference.upsert({
    where: { userId_householdId_key: { userId, householdId, key } },
    create: { userId, householdId, key, value },
    update: { value },
  });
}
