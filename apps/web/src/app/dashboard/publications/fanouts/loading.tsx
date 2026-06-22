import { SkeletonLoader } from "@/components/layout/SkeletonLoader";

export default function CrosspostingSummaryLoading() {
  return (
    <div className="space-y-6">
      <SkeletonLoader count={4} variant="stat" />
      <SkeletonLoader count={4} variant="card" />
    </div>
  );
}
