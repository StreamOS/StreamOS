const revenueSources = [
  { source: "Subs", amount: "$7.8k", note: "Stable community baseline" },
  { source: "Sponsoring", amount: "$6.2k", note: "Two active brand fits" },
  { source: "Merch", amount: "$2.9k", note: "Drop after weekend stream" },
  { source: "Memberships", amount: "$1.5k", note: "YouTube recurring revenue" }
];

export default function MonetizationPage() {
  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.08em] text-signal-green">Monetization</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Revenue Mix und Sponsor-Pipeline</h1>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {revenueSources.map((entry) => (
          <article className="card" key={entry.source}>
            <p className="text-sm text-slate-400">{entry.source}</p>
            <strong className="mt-3 block text-3xl text-white">{entry.amount}</strong>
            <span className="mt-1 block text-sm text-slate-400">{entry.note}</span>
          </article>
        ))}
      </section>

      <section className="card">
        <h2 className="text-lg font-semibold text-white">Pricing hypothesis</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {["Starter / $0", "Creator Pro / $29", "Team / $99"].map((plan) => (
            <div className="rounded-lg border border-white/10 bg-white/5 p-4" key={plan}>
              <strong className="text-white">{plan}</strong>
              <p className="mt-2 text-sm text-slate-400">Validate clip volume, analytics usage, and sponsor workflow depth.</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
