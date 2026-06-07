import { SkeletonLoader } from "@/components/layout/SkeletonLoader";

export default function AnalyticsLoading() {
  return (
    <div className="space-y-6">
      <SkeletonLoader count={4} variant="stat" />
      <SkeletonLoader variant="chart" />
    </div>
  );
}
