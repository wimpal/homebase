import { Skeleton } from "@/components/ui/skeleton";

type PageSkeletonProps = {
  /** Accessible label for the loading status (translated by the caller). */
  label?: string;
};

export function PageSkeleton({ label }: PageSkeletonProps) {
  return (
    <div role="status" aria-label={label} className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-3 rounded-xl border p-6">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
