import { BarChart, LineChart } from "@/components/ui/Charts";
import { painData } from "@/data/defaultWorkspace";
import type { ScoreSummary, WorkspaceState } from "@/types/streamos";

type AnalyticsViewProps = {
  state: WorkspaceState;
  scores: ScoreSummary;
  onRangeChange: (range: WorkspaceState["range"]) => void;
};

const ranges: WorkspaceState["range"][] = [7, 30, 90];

export function AnalyticsView({ state, scores, onRangeChange }: AnalyticsViewProps) {
  const insights = [
    {
      title: "Bester Wachstumspfad",
      body: `${state.profile.niche}: Shorts aus High-Chat-Momenten vor Live-Reminder posten.`
    },
    {
      title: "Monetarisierung",
      body:
        scores.moneyTotal > 1500
          ? "Creator-Pro Preisanker ist plausibel. Sponsor-Pipeline priorisieren."
          : "Subs und Merch erst stabilisieren, Sponsoring danach starten."
    },
    {
      title: "Risiko",
      body:
        scores.burnout > 55
          ? "Wochenstunden reduzieren oder Batch-Content staerker automatisieren."
          : "Content-Last aktuell tragbar. Review-Slot beibehalten."
    }
  ];

  return (
    <section className="view active">
      <div className="dashboard-grid">
        <article className="panel chart-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">StreamIQ Analytics</p>
              <h3>Viewer & Umsatz Prognose</h3>
            </div>
            <div className="segmented">
              {ranges.map((range) => (
                <button
                  className={state.range === range ? "active" : ""}
                  key={range}
                  onClick={() => onRangeChange(range)}
                  type="button"
                >
                  {range}T
                </button>
              ))}
            </div>
          </div>
          <LineChart range={state.range} moneyCount={state.money.length} />
        </article>

        <article className="panel">
          <p className="eyebrow">Problem-Schweregrad</p>
          <h3>Branchen Pain Points</h3>
          <BarChart data={painData} maxValue={10} compact />
        </article>

        <article className="panel wide-panel">
          <p className="eyebrow">AI Insights</p>
          <div className="insight-grid">
            {insights.map((insight) => (
              <article className="insight-card" key={insight.title}>
                <strong>{insight.title}</strong>
                <p>{insight.body}</p>
              </article>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
