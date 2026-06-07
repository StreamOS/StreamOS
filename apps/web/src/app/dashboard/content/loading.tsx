import { SkeletonLoader } from "@/components/layout/SkeletonLoader";

export default function ContentLoading() {
  return <SkeletonLoader count={6} variant="card" />;
}
