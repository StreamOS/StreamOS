const clips = [
  { title: "Ranked clutch ending", platform: "TikTok", status: "Ready", score: 94 },
  { title: "Sponsor callout remix", platform: "YouTube Shorts", status: "Analyzing", score: 81 },
  { title: "Community Q&A highlight", platform: "Twitch", status: "Queued", score: 76 }
];

export function RecentClips() {
  return (
    <section className="card">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-950">Recent AI clips</h2>
        <button className="btn-primary">Generate clips</button>
      </div>
      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">Clip</th>
              <th className="px-4 py-3 font-medium">Platform</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Score</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {clips.map((clip) => (
              <tr key={clip.title}>
                <td className="px-4 py-3 font-medium text-slate-950">{clip.title}</td>
                <td className="px-4 py-3 text-slate-600">{clip.platform}</td>
                <td className="px-4 py-3 text-slate-600">{clip.status}</td>
                <td className="px-4 py-3 text-slate-600">{clip.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
