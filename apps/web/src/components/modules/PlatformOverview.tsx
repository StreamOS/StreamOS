const platforms = [
  { name: "Twitch", followers: "86.2k", status: "Connected" },
  { name: "YouTube", followers: "42.8k", status: "Connected" },
  { name: "TikTok", followers: "118.4k", status: "OAuth pending" },
  { name: "Kick", followers: "9.7k", status: "Connected" }
];

export function PlatformOverview() {
  return (
    <section className="card">
      <h2 className="text-base font-semibold text-slate-950">Platform overview</h2>
      <div className="mt-4 space-y-3">
        {platforms.map((platform) => (
          <div key={platform.name} className="flex items-center justify-between rounded-md border border-slate-200 p-3">
            <div>
              <div className="font-medium text-slate-950">{platform.name}</div>
              <div className="text-sm text-slate-500">{platform.followers} followers</div>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
              {platform.status}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
