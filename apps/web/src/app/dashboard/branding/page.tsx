const colors = ["#9b5cff", "#00d4aa", "#ff4e6a", "#f5c842"];

export default function BrandingPage() {
  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.08em] text-signal-green">Branding Studio</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Overlays, Alerts und Creator-Markenlogik</h1>
      </header>

      <section className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <article className="card">
          <h2 className="text-lg font-semibold text-white">Brand Kit</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {colors.map((color) => (
              <div className="min-h-20 rounded-lg border border-white/10" key={color} style={{ background: color }} />
            ))}
          </div>
        </article>
        <article className="card">
          <div className="grid min-h-72 content-end rounded-lg border border-white/10 bg-[linear-gradient(135deg,transparent_0_55%,rgba(155,92,255,.7)_56%_64%,transparent_65%),linear-gradient(35deg,rgba(0,212,170,.18),rgba(255,78,106,.2))] p-6">
            <strong className="text-3xl text-white">NovaPlays Live</strong>
            <p className="mt-2 text-slate-300">Neon Tactical / high contrast / chat ready</p>
          </div>
        </article>
      </section>
    </div>
  );
}
