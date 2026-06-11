import { Search, Sparkles, Tags, TrendingUp } from "lucide-react";
import { getDiscoverabilityOverview } from "@/lib/dashboard/insights";

export default async function DiscoverabilityPage() {
  const overview = await getDiscoverabilityOverview();

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-signal-green">
            Auffindbarkeit
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-white">
            SEO, Hooks und Reichweiten-Signale
          </h1>
        </div>
        <button className="btn-primary" type="button">
          Audit aktualisieren
        </button>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <article className="card">
          <StatIcon icon={Search} />
          <p className="mt-4 text-sm text-slate-400">Auffindbarkeits-Score</p>
          <strong className="mt-2 block text-3xl text-white">
            {overview.score}
          </strong>
        </article>
        <article className="card">
          <StatIcon icon={TrendingUp} />
          <p className="mt-4 text-sm text-slate-400">Woechentlicher Zuwachs</p>
          <strong className="mt-2 block text-3xl text-white">
            {overview.weeklyGrowthLabel}
          </strong>
        </article>
        <article className="card">
          <StatIcon icon={Tags} />
          <p className="mt-4 text-sm text-slate-400">Aktive Plattformen</p>
          <strong className="mt-2 block text-3xl text-white">
            {overview.activePlatforms}
          </strong>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_380px]">
        <div className="card">
          <div className="flex items-center gap-3">
            <StatIcon icon={Sparkles} />
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
                Optimierungs-Warteschlange
              </p>
              <h2 className="mt-1 text-lg font-semibold text-white">
                Priorisierte Empfehlungen
              </h2>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {overview.recommendations.length === 0 ? (
              <article className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm leading-6 text-slate-400">
                Sobald Metrics-Snapshots fuer eine Plattform vorliegen,
                berechnet StreamOS daraus die naechsten Optimierungsschritte.
              </article>
            ) : (
              overview.recommendations.map((item) => (
                <article
                  className="rounded-lg border border-white/10 bg-white/5 p-4"
                  key={item.label}
                >
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="font-semibold text-white">{item.label}</h3>
                    <span className="rounded-full border border-signal-green/30 bg-signal-green/10 px-2.5 py-1 text-xs font-semibold text-signal-green">
                      {item.score}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-400">
                    {item.recommendation}
                  </p>
                </article>
              ))
            )}
          </div>
        </div>

        <aside className="card">
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
            Top-Signale
          </p>
          <h2 className="mt-2 text-lg font-semibold text-white">
            Snapshot- und Job-Druckpunkte
          </h2>
          <div className="mt-5 grid gap-3">
            {overview.topSignals.length === 0 ? (
              <article className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm leading-6 text-slate-400">
                Sobald Snapshots und Content-Jobs vorliegen, fasst StreamOS die
                wichtigsten Signale hier zusammen.
              </article>
            ) : (
              overview.topSignals.map((signal) => (
                <article
                  className="rounded-lg border border-white/10 bg-white/5 p-4"
                  key={signal.label}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
                        {signal.label}
                      </p>
                      <strong className="mt-2 block text-xl text-white">
                        {signal.value}
                      </strong>
                    </div>
                    <span
                      className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${signalToneClasses[signal.tone]}`}
                    >
                      {signalToneLabels[signal.tone]}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-400">
                    {signal.detail}
                  </p>
                </article>
              ))
            )}
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {overview.signalChips.length === 0 ? (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-300">
                Noch keine Signalchips verfuegbar
              </span>
            ) : (
              overview.signalChips.map((signal) => (
                <span
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-300"
                  key={signal}
                >
                  {signal}
                </span>
              ))
            )}
          </div>
        </aside>
      </section>
    </div>
  );
}

const signalToneClasses = {
  amber: "border-amber-300/30 bg-amber-300/10 text-amber-200",
  emerald: "border-signal-green/30 bg-signal-green/10 text-signal-green",
  rose: "border-signal-red/30 bg-signal-red/10 text-signal-red",
  violet: "border-brand-500/30 bg-brand-500/10 text-brand-200",
} as const;

const signalToneLabels = {
  amber: "Warnung",
  emerald: "Lead",
  rose: "Prioritaet",
  violet: "Signal",
} as const;

function StatIcon({ icon: Icon }: { icon: typeof Search }) {
  return (
    <span className="inline-flex rounded-lg border border-brand-500/20 bg-brand-500/10 p-2 text-brand-500">
      <Icon className="h-4 w-4" aria-hidden="true" />
    </span>
  );
}
