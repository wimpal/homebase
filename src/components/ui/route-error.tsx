"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

type RouteErrorProps = {
  error: Error & { digest?: string };
  /** Retry the failed segment (Next error.tsx `unstable_retry` or `reset`). */
  reset: () => void;
  homeHref?: string;
  homeLabel?: string;
};

export function RouteError({
  error,
  reset,
  homeHref = "/dashboard",
  homeLabel,
}: RouteErrorProps) {
  const t = useTranslations("ui.routeError");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div
      data-slot="route-error"
      className="flex min-h-[50vh] flex-col items-center justify-center gap-2 p-6 text-center"
    >
      <div
        aria-hidden
        className="mb-1 flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive [&_svg]:size-5"
      >
        <TriangleAlert />
      </div>
      <h2 className="text-base font-semibold">{t("title")}</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        {t("description")}
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <Button onClick={() => reset()}>{t("retry")}</Button>
        <Button asChild variant="outline">
          <Link href={homeHref}>{homeLabel ?? t("home")}</Link>
        </Button>
      </div>
    </div>
  );
}
