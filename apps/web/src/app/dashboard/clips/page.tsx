import { RecentClips } from "@/components/modules/RecentClips";

export default function ClipsPage() {
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-signal-green">AI Clip Engine</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">VODs analysieren und Shortform-Pipeline steuern</h1>
        </div>
        <button className="btn-primary">Clip Analyse starten</button>
      </header>

      <section className="card">
        <div className="grid gap-4 md:grid-cols-3">
          <label className="grid gap-2 text-sm font-semibold text-slate-300">
            VOD URL
            <input className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-signal-green" placeholder="https://www.twitch.tv/videos/..." />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-slate-300">
            Kategorie
            <input className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-signal-green" placeholder="Valorant, Just Chatting, Minecraft" />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-slate-300">
            Chat Aktivitaet
            <select className="rounded-lg border border-white/10 bg-surface-900 px-3 py-2 text-white outline-none focus:border-signal-green">
              <option>hoch</option>
              <option>mittel</option>
              <option>niedrig</option>
            </select>
          </label>
        </div>
      </section>

      <RecentClips />
    </div>
  );
}
