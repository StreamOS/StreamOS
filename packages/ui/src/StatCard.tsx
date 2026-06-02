import React from "react";
import type { LucideIcon } from "lucide-react";

type StatCardProps = {
  label: string;
  value: string;
  trend: string;
  icon: LucideIcon;
  tone?: "violet" | "emerald" | "rose" | "amber";
};

const toneClasses = {
  violet: "text-brand-500 bg-brand-500/10 border-brand-500/20",
  emerald: "text-signal-green bg-signal-green/10 border-signal-green/20",
  rose: "text-signal-red bg-signal-red/10 border-signal-red/20",
  amber: "text-signal-gold bg-signal-gold/10 border-signal-gold/20",
};

export function StatCard({
  label,
  value,
  trend,
  icon: Icon,
  tone = "violet",
}: StatCardProps) {
  return (
    <article className="card">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-slate-400">{label}</div>
        <span className={`rounded-lg border p-2 ${toneClasses[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-4 text-3xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-sm text-slate-400">{trend}</div>
    </article>
  );
}
