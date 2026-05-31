import type { FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import type { ClipFormInput } from "@/hooks/useWorkspaceState";
import type { ClipCandidate } from "@/types/streamos";

type ClipsViewProps = {
  clips: ClipCandidate[];
  onGenerate: (input: ClipFormInput) => void;
  onClear: () => void;
};

export function ClipsView({ clips, onGenerate, onClear }: ClipsViewProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    onGenerate({
      vodUrl: String(data.vodUrl),
      streamTitle: String(data.streamTitle),
      category: String(data.category),
      duration: Number(data.duration),
      chatEnergy: String(data.chatEnergy) as ClipFormInput["chatEnergy"]
    });
  }

  return (
    <section className="view active">
      <div className="two-column">
        <article className="panel">
          <p className="eyebrow">AI Clip & Content Engine</p>
          <h2>VOD analysieren und Clip-Kandidaten erzeugen.</h2>
          <form className="form-grid" onSubmit={handleSubmit}>
            <label className="full">Twitch VOD oder YouTube Link<input name="vodUrl" required placeholder="https://www.twitch.tv/videos/123456789" /></label>
            <label>Stream Titel<input name="streamTitle" required placeholder="Ranked Push mit Community" /></label>
            <label>Kategorie<input name="category" placeholder="Just Chatting, Valorant, Minecraft" /></label>
            <label>Laenge in Minuten<input name="duration" type="number" min="10" max="720" defaultValue="180" /></label>
            <label>
              Chat Aktivitaet
              <select name="chatEnergy" defaultValue="hoch">
                <option value="hoch">hoch</option>
                <option value="mittel">mittel</option>
                <option value="niedrig">niedrig</option>
              </select>
            </label>
            <Button type="submit">Clip Analyse starten</Button>
          </form>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <h3>Clip Queue</h3>
            <Button variant="ghost" compact onClick={onClear}>Leeren</Button>
          </div>
          <div className="clip-list">
            {clips.length === 0 ? (
              <div className="empty-state">Noch keine Clips. Starte eine VOD-Analyse.</div>
            ) : (
              clips.map((clip) => (
                <article className="clip-row" key={clip.id}>
                  <div>
                    <b>{clip.title}</b>
                    <small>{clip.hook}</small>
                  </div>
                  <span>Hook {clip.score}</span>
                  <small>{clip.platform} / {clip.status}</small>
                </article>
              ))
            )}
          </div>
        </article>
      </div>
    </section>
  );
}
