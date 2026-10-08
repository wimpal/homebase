import Link from "next/link";
import { cn } from "@/lib/utils";
import { itemDotClass } from "./feed-colors";
import { weekdayShortLabels } from "./format";
import type { CalendarDayItem } from "./types";

type MonthGridProps = {
  month: string;
  gridKeys: string[];
  today: string;
  selectedDay: string;
  buckets: Map<string, CalendarDayItem[]>;
  bcp47: string;
};

export function MonthGrid({
  month,
  gridKeys,
  today,
  selectedDay,
  buckets,
  bcp47,
}: MonthGridProps) {
  const weekdays = weekdayShortLabels(bcp47);

  return (
    <div className="space-y-1">
      <div className="grid grid-cols-7 gap-1">
        {weekdays.map((label) => (
          <div
            key={label}
            className="py-1 text-center text-xs font-medium text-muted-foreground"
          >
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {gridKeys.map((key) => {
          const items = buckets.get(key) ?? [];
          const inMonth = key.startsWith(month);
          const isToday = key === today;
          const isSelected = key === selectedDay;

          return (
            <Link
              key={key}
              href={`/calendar?month=${month}&day=${key}`}
              aria-current={isSelected ? "date" : undefined}
              className={cn(
                "flex min-h-16 flex-col gap-1 rounded-md border p-1.5 transition-colors hover:bg-accent sm:min-h-20 md:min-h-24",
                !inMonth && "opacity-50",
                isSelected &&
                  "border-emerald-600 ring-1 ring-emerald-600 hover:bg-transparent",
              )}
            >
              <span
                className={cn(
                  "self-start text-xs font-medium tabular-nums",
                  isToday &&
                    "rounded-full bg-emerald-600 px-1.5 leading-5 text-white",
                )}
              >
                {Number(key.slice(8))}
              </span>

              <div className="flex flex-wrap gap-1 md:hidden">
                {items.slice(0, 4).map((item, index) => (
                  <span
                    key={`${item.kind}-${item.id}-${index}`}
                    className={cn(
                      "size-1.5 rounded-full",
                      itemDotClass(item),
                    )}
                  />
                ))}
              </div>

              <div className="hidden min-w-0 flex-col gap-0.5 md:flex">
                {items.slice(0, 3).map((item, index) => (
                  <span
                    key={`${item.kind}-${item.id}-${index}`}
                    className="flex min-w-0 items-center gap-1 text-[11px] leading-4"
                  >
                    <span
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        itemDotClass(item),
                      )}
                    />
                    <span className="truncate">{item.title}</span>
                  </span>
                ))}
                {items.length > 3 ? (
                  <span className="text-[10px] text-muted-foreground">
                    +{items.length - 3}
                  </span>
                ) : null}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
