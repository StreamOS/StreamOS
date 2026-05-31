import { Activity, BadgeDollarSign, Clapperboard, Search } from "lucide-react";
import { StatCard } from "@streamos/ui";
import { PlatformOverview } from "@/components/modules/PlatformOverview";
import { RecentClips } from "@/components/modules/RecentClips";
import { ViewerChart } from "@/components/modules/ViewerChart";

const stats = [
  { label: "Discovery score", value: "82", trend: "+9%", icon: Search },
  { label: "Monthly revenue", value: "$18.4k", trend: "+14%", icon: BadgeDollarSign },
  { label: "AI clips queued", value: "36", trend: "12 ready", icon: Clapperboard },
  { label: "Live reach", value: "148k", trend: "+21%", icon: Activity }
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-medium text-brand-700">Creator command center</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-normal text-slate-950">
          StreamOS Dashboard
        </h1>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
        <ViewerChart />
        <PlatformOverview />
      </section>

      <RecentClips />
    </div>
  );
}
