import { SkeletonLoader } from "@/components/layout/SkeletonLoader";

export default function MonetizationLoading() {
  return (
    <div className="space-y-6">
      <SkeletonLoader count={3} variant="stat" />
      <SkeletonLoader count={6} variant="table" />
    </div>
  );
}
