/** Static class maps for calendar colours (Tailwind needs literal classes). */

import type { CalendarDayItem } from "./types";

export const FEED_DOT_CLASSES: Record<string, string> = {
  emerald: "bg-emerald-500",
  sky: "bg-sky-500",
  violet: "bg-violet-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  teal: "bg-teal-500",
};

export const FEED_CHIP_CLASSES: Record<string, string> = {
  emerald: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  sky: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  violet: "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200",
  amber: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  rose: "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200",
  teal: "bg-teal-100 text-teal-900 dark:bg-teal-950 dark:text-teal-200",
};

export const NATIVE_DOT_CLASS = "bg-emerald-600";
export const CHORE_DOT_CLASS = "bg-amber-600";

export function feedDotClass(color: string): string {
  return FEED_DOT_CLASSES[color] ?? "bg-zinc-400";
}

export function feedChipClass(color: string): string {
  return FEED_CHIP_CLASSES[color] ?? "bg-muted text-muted-foreground";
}

export function itemDotClass(item: CalendarDayItem): string {
  if (item.kind === "native") return NATIVE_DOT_CLASS;
  if (item.kind === "chore") return CHORE_DOT_CLASS;
  return feedDotClass(item.feedColor);
}
