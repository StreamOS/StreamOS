import { Button } from "@/components/ui/Button";

type SettingsViewProps = {
  onSeed: () => void;
  onReset: () => void;
};

export function SettingsView({ onSeed, onReset }: SettingsViewProps) {
  return (
    <section className="view active">
      <div className="two-column">
        <article className="panel">
          <p className="eyebrow">Settings</p>
          <h2>Workspace-Verwaltung</h2>
          <div className="settings-stack">
            <Button variant="ghost" onClick={onSeed}>Demo-Daten neu laden</Button>
            <Button variant="danger" onClick={onReset}>Lokale Daten loeschen</Button>
          </div>
        </article>
        <article className="panel">
          <p className="eyebrow">Produktions-Notizen</p>
          <ul className="check-list">
            <li>Echte Auth: Supabase SSR Client, Middleware und RLS Policies.</li>
            <li>OAuth: Twitch und YouTube Server-Routen mit Token-Refresh.</li>
            <li>EventSub: HMAC-Verifikation, Replay-Schutz und async Handler.</li>
            <li>KI: Whisper fuer Transkripte, OpenAI fuer Highlight Scoring.</li>
          </ul>
        </article>
      </div>
    </section>
  );
}
