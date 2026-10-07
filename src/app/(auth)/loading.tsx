import { getTranslations } from "next-intl/server";
import { Skeleton } from "@/components/ui/skeleton";

export default async function AuthLoading() {
  const t = await getTranslations("ui.loading");
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div
        role="status"
        aria-label={t("label")}
        className="w-full max-w-md space-y-6 rounded-xl border bg-card p-6 text-card-foreground shadow-sm"
      >
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-56 max-w-full" />
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-10 w-full" />
          </div>
          <Skeleton className="h-9 w-full" />
        </div>
      </div>
    </div>
  );
}
