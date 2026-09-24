"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ShoppingPlanningView } from "./ShoppingPlanningView";
import { ShoppingTripView } from "./ShoppingTripView";
import { clearTripBought } from "./trip-storage";
import type { ShoppingViewProps } from "./types";

export function ShoppingClient(props: ShoppingViewProps) {
  const t = useTranslations("shopping");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode") === "trip" ? "trip" : "shop";

  useEffect(() => {
    if (mode === "shop") {
      clearTripBought(props.listId);
    }
  }, [mode, props.listId]);

  function setMode(next: "shop" | "trip") {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "trip") {
      params.set("mode", "trip");
    } else {
      params.delete("mode");
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-zinc-500">
            {mode === "trip" ? t("subtitleTrip") : t("subtitlePlanning")}
          </p>
        </div>
        <div
          className="inline-flex rounded-lg bg-zinc-100 p-1 dark:bg-zinc-900"
          role="tablist"
          aria-label={`${t("planning")} / ${t("trip")}`}
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "shop"}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              mode === "shop"
                ? "bg-white text-zinc-900 shadow dark:bg-zinc-800 dark:text-zinc-100"
                : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            }`}
            onClick={() => setMode("shop")}
          >
            {t("planning")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "trip"}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              mode === "trip"
                ? "bg-white text-zinc-900 shadow dark:bg-zinc-800 dark:text-zinc-100"
                : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            }`}
            onClick={() => setMode("trip")}
          >
            {t("trip")}
          </button>
        </div>
      </div>

      {mode === "trip" ? (
        <ShoppingTripView {...props} />
      ) : (
        <ShoppingPlanningView {...props} />
      )}
    </div>
  );
}
