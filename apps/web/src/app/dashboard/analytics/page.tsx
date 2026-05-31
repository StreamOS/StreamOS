import { ViewerChart } from "@/components/modules/ViewerChart";
import { platforms } from "@/data/dashboard";

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.08em] text-signal-green">StreamIQ Analytics</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Performance, Reichweite und Plattform-Fit</h1>
      </header>

      <ViewerChart />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {platforms.map((platform) => (
          <article className="card" key={platform.id}>
            <p className="text-sm text-slate-400">{platform.name}</p>
            <strong className="mt-3 block text-3xl text-white">{platform.reach}</strong>
            <span className="mt-1 block text-sm text-slate-400">{platform.followers} followers</span>
          </article>
        ))}
      </section>
    </div>
  );
}
