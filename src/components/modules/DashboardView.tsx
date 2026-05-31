import { Button } from "@/components/ui/Button";
import { BarChart } from "@/components/ui/Charts";
import { marketData } from "@/data/defaultWorkspace";
import { euro } from "@/lib/format";
import type { RouteId, ScoreSummary, WorkspaceState } from "@/types/streamos";

type DashboardViewProps = {
  state: WorkspaceState;
  scores: ScoreSummary;
  onJump: (route: RouteId) => void;
  onSimulateEvent: () => void;
};

export function DashboardView({ state, scores, onJump, onSimulateEvent }: DashboardViewProps) {
  const tasks = [
    `SEO-Titel fuer ${state.profile.niche} mit klarer Hook schreiben`,
    `${Math.min(5, Math.max(2, state.clips.length))} beste Clips fuer Shorts und TikTok einplanen`,
    scores.connectedCount < 4
      ? "Offene Plattformen verbinden, damit Repurposing vollstaendig ist"
      : "EventSub Feed und Upload Zeiten beobachten",
    scores.burnout > 55 ? "Recovery Slot in den Wochenplan setzen" : "Sponsor Pitch aus Top-Clip Performance bauen"
  ];

  return (
    <section className="view active">
      <div className="dashboard-grid">
        <article className="hero-panel">
          <div className="hero-copy">
            <span className="status-pill"><span /><b>{scores.connectedCount} Plattformen verbunden</b></span>
            <h2>Aus deinem Stream wird ein kompletter Content- und Umsatz-Funnel.</h2>
            <p>
              Die Plattform verbindet Discoverability, Clip-Automatisierung, Monetarisierung, Branding,
              Multi-Plattform-Management und Analytics in einem nutzbaren lokalen MVP.
            </p>
            <div className="hero-actions">
              <Button onClick={() => onJump("clips")}>VOD analysieren</Button>
              <Button variant="ghost" onClick={() => onJump("onboarding")}>Setup starten</Button>
            </div>
          </div>
          <div className="stream-card">
            <div className="stream-preview">
              <div className="play-triangle" />
              <span>STREAM PIPELINE</span>
            </div>
            <div className="pipeline">
              <div><strong>{state.clips.length}</strong><span>Clip Kandidaten</span></div>
              <div><strong>{Math.max(0, state.clips.filter((clip) => clip.status !== "archiviert").length)}</strong><span>Posts geplant</span></div>
              <div><strong>{Math.max(1, Math.round(scores.moneyTotal / 700))}</strong><span>Sponsor Fits</span></div>
            </div>
          </div>
        </article>

        <MetricCard accent="accent-purple" label="Discoverability Score" value={scores.discoverability} helper="SEO, Clips und Plattform-Fit" />
        <MetricCard accent="accent-green" label="Prognose MRR" value={euro(scores.moneyTotal)} helper="Subs, Merch, Sponsoring" />
        <MetricCard accent="accent-red" label="Burnout Risiko" value={`${scores.burnout}%`} helper="Aus Planner und Content-Druck" />

        <article className="panel chart-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Marktreferenz aus Analyse</p>
              <h3>Plattform-Stunden Q2/2025</h3>
            </div>
            <span className="tag">Mrd. Stunden</span>
          </div>
          <BarChart data={marketData} />
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">AI Operating Plan</p>
              <h3>Naechste Schritte</h3>
            </div>
          </div>
          <ul className="task-list">
            {tasks.map((task) => <li key={task}><span />{task}</li>)}
          </ul>
        </article>

        <article className="panel wide-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Live Event Feed</p>
              <h3>EventSub Simulation</h3>
            </div>
            <Button variant="ghost" compact onClick={onSimulateEvent}>Event simulieren</Button>
          </div>
          <div className="event-feed">
            {state.events.slice(0, 7).map((event) => (
              <div className="event-row" key={event.id}>
                <span>{event.type}</span>
                <strong>{event.text}</strong>
                <small>{event.time}</small>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}

type MetricCardProps = {
  accent: string;
  label: string;
  value: string | number;
  helper: string;
};

function MetricCard({ accent, label, value, helper }: MetricCardProps) {
  return (
    <article className={`metric-card ${accent}`}>
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{helper}</span>
    </article>
  );
}
