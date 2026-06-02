import { clips } from "@/data/dashboard";

export function RecentClips() {
  return (
    <section className="card">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">Recent AI clips</h2>
        <button className="btn-primary">Generate clips</button>
      </div>
      <div className="mt-4 overflow-hidden rounded-lg border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/5 text-slate-300">
            <tr>
              <th className="px-4 py-3 font-medium">Clip</th>
              <th className="px-4 py-3 font-medium">Platform</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Score</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10 bg-surface-900/60">
            {clips.map((clip) => (
              <tr key={clip.title}>
                <td className="px-4 py-3">
                  <div className="font-medium text-white">{clip.title}</div>
                  <div className="text-xs text-slate-400">{clip.hook}</div>
                </td>
                <td className="px-4 py-3 text-slate-300">{clip.platform}</td>
                <td className="px-4 py-3 text-slate-300">{clip.status}</td>
                <td className="px-4 py-3 font-semibold text-signal-green">
                  {clip.score}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
