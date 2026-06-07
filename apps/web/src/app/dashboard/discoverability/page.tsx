import { Search, Sparkles, Tags, TrendingUp } from "lucide-react";

const auditItems = [
  {
    label: "Channel SEO",
    score: 82,
    recommendation:
      "Titel, Bio und Kategorie-Keywords fuer Twitch synchronisieren.",
  },
  {
    label: "Shortform Hooks",
    score: 76,
    recommendation:
      "Erste 3 Sekunden staerker auf Konflikt und Outcome trimmen.",
  },
  {
    label: "Cross-platform Metadata",
    score: 69,
    recommendation: "TikTok und YouTube Tags mit Stream-Kategorien angleichen.",
  },
] as const;

const keywordClusters = [
  "tactical fps coaching",
  "ranked clutch highlights",
  "streamer community challenges",
  "valorant aim routine",
  "creator monetization tips",
] as const;

export default function DiscoverabilityPage() {
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-signal-green">
            Discoverability
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
          <p className="mt-4 text-sm text-slate-400">Discovery Score</p>
          <strong className="mt-2 block text-3xl text-white">82</strong>
        </article>
        <article className="card">
          <StatIcon icon={TrendingUp} />
          <p className="mt-4 text-sm text-slate-400">Weekly Lift</p>
          <strong className="mt-2 block text-3xl text-white">+9%</strong>
        </article>
        <article className="card">
          <StatIcon icon={Tags} />
          <p className="mt-4 text-sm text-slate-400">Keyword Clusters</p>
          <strong className="mt-2 block text-3xl text-white">5</strong>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_380px]">
        <div className="card">
          <div className="flex items-center gap-3">
            <StatIcon icon={Sparkles} />
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
                Optimization Queue
              </p>
              <h2 className="mt-1 text-lg font-semibold text-white">
                Priorisierte Empfehlungen
              </h2>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {auditItems.map((item) => (
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
            ))}
          </div>
        </div>

        <aside className="card">
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
            Keyword Map
          </p>
          <h2 className="mt-2 text-lg font-semibold text-white">
            Aktive Suchcluster
          </h2>
          <div className="mt-5 flex flex-wrap gap-2">
            {keywordClusters.map((keyword) => (
              <span
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-300"
                key={keyword}
              >
                {keyword}
              </span>
            ))}
          </div>
        </aside>
      </section>
    </div>
  );
}

function StatIcon({ icon: Icon }: { icon: typeof Search }) {
  return (
    <span className="inline-flex rounded-lg border border-brand-500/20 bg-brand-500/10 p-2 text-brand-500">
      <Icon className="h-4 w-4" aria-hidden="true" />
    </span>
  );
}
