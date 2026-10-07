"use client";

import { useTranslations } from "next-intl";
import { RouteError } from "@/components/ui/route-error";

export default function AuthError({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  unstable_retry?: () => void;
}) {
  const t = useTranslations("ui.routeError");
  return (
    <RouteError
      error={error}
      reset={unstable_retry ?? reset}
      homeHref="/login"
      homeLabel={t("homeAuth")}
    />
  );
}
