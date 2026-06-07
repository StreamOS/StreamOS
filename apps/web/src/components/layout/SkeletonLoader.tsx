import { cn } from "@/lib/utils/cn";

type SkeletonVariant = "card" | "chart" | "list" | "stat" | "table";

type SkeletonLoaderProps = {
  className?: string;
  count?: number;
  variant: SkeletonVariant;
};

export function SkeletonLoader({
  className,
  count = 1,
  variant,
}: SkeletonLoaderProps) {
  const itemCount = Math.max(1, count);

  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className={cn("w-full", className)}
      role="status"
    >
      <span className="sr-only">Dashboard-Bereich wird geladen.</span>
      {variant === "stat" && <StatSkeleton count={itemCount} />}
      {variant === "chart" && <ChartSkeleton />}
      {variant === "table" && <TableSkeleton count={itemCount} />}
      {variant === "card" && <CardSkeleton count={itemCount} />}
      {variant === "list" && <ListSkeleton count={itemCount} />}
    </div>
  );
}

function SkeletonBlock({ className }: { className: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-lg bg-slate-200/80 dark:bg-white/10",
        className,
      )}
    />
  );
}

function StatSkeleton({ count }: { count: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <article
          className="h-24 rounded-lg border border-slate-200 bg-white/80 p-4 dark:border-white/10 dark:bg-surface-900/85"
          key={`stat-skeleton-${index}`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-3">
              <SkeletonBlock className="h-3 w-24" />
              <SkeletonBlock className="h-7 w-28" />
            </div>
            <SkeletonBlock className="h-9 w-9" />
          </div>
        </article>
      ))}
    </div>
  );
}

function ChartSkeleton() {
  return (
    <section className="rounded-lg border border-slate-200 bg-white/80 p-5 dark:border-white/10 dark:bg-surface-900/85">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div className="space-y-2">
          <SkeletonBlock className="h-3 w-28" />
          <SkeletonBlock className="h-5 w-44" />
        </div>
        <SkeletonBlock className="h-8 w-24" />
      </div>
      <SkeletonBlock className="h-64 w-full" />
    </section>
  );
}

function TableSkeleton({ count }: { count: number }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white/80 p-5 dark:border-white/10 dark:bg-surface-900/85">
      <div className="mb-5 space-y-2">
        <SkeletonBlock className="h-3 w-24" />
        <SkeletonBlock className="h-5 w-52" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: count }).map((_, index) => (
          <div
            className="grid h-10 grid-cols-[3fr_2fr_2fr_1fr] items-center gap-3"
            key={`table-skeleton-${index}`}
          >
            <SkeletonBlock className="h-4 w-full" />
            <SkeletonBlock className="h-4 w-full" />
            <SkeletonBlock className="h-4 w-full" />
            <SkeletonBlock className="h-4 w-full" />
          </div>
        ))}
      </div>
    </section>
  );
}

function CardSkeleton({ count }: { count: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }).map((_, index) => (
        <article
          className="h-40 rounded-lg border border-slate-200 bg-white/80 p-5 dark:border-white/10 dark:bg-surface-900/85"
          key={`card-skeleton-${index}`}
        >
          <div className="flex h-full flex-col justify-between">
            <div className="space-y-3">
              <SkeletonBlock className="h-4 w-32" />
              <SkeletonBlock className="h-3 w-full" />
              <SkeletonBlock className="h-3 w-4/5" />
            </div>
            <SkeletonBlock className="h-8 w-28" />
          </div>
        </article>
      ))}
    </div>
  );
}

function ListSkeleton({ count }: { count: number }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white/80 p-5 dark:border-white/10 dark:bg-surface-900/85">
      <div className="mb-5 space-y-2">
        <SkeletonBlock className="h-3 w-28" />
        <SkeletonBlock className="h-5 w-56" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: count }).map((_, index) => (
          <div
            className="flex items-center gap-4"
            key={`list-skeleton-${index}`}
          >
            <SkeletonBlock className="h-10 w-10 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <SkeletonBlock className="h-4 w-2/3" />
              <SkeletonBlock className="h-3 w-full" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
