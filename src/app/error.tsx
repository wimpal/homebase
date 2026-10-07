"use client";

import { RouteError } from "@/components/ui/route-error";

export default function RootError({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  unstable_retry?: () => void;
}) {
  return <RouteError error={error} reset={unstable_retry ?? reset} />;
}
