import type { LucideIcon } from "lucide-react";

type StatCardProps = {
  label: string;
  value: string;
  trend: string;
  icon: LucideIcon;
};

export function StatCard({ label, value, trend, icon: Icon }: StatCardProps) {
  return (
    <article className="card">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-slate-500">{label}</div>
        <Icon className="h-4 w-4 text-brand-500" />
      </div>
      <div className="mt-4 text-2xl font-semibold text-slate-950">{value}</div>
      <div className="mt-1 text-sm text-emerald-700">{trend}</div>
    </article>
  );
}
