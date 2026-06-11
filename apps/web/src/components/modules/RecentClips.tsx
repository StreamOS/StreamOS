import type { RecentClipDisplay } from "@/lib/dashboard/insights";
import { getRecentClips } from "@/lib/dashboard/insights";

type RecentClipsProps = {
  clips?: RecentClipDisplay[];
};

export async function RecentClips({ clips }: RecentClipsProps) {
  const clipRows = clips ?? (await getRecentClips());

  return (
    <section className="card">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">
          Aktuelle KI-Clips
        </h2>
        <a className="btn-primary" href="/dashboard/clips">
          Clips generieren
        </a>
      </div>
      <div className="mt-4 overflow-hidden rounded-lg border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/5 text-slate-300">
            <tr>
              <th className="px-4 py-3 font-medium">Clip</th>
              <th className="px-4 py-3 font-medium">Plattform</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Punktzahl</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10 bg-surface-900/60">
            {clipRows.length === 0 ? (
              <tr>
                <td className="px-4 py-5 text-slate-400" colSpan={4}>
                  Noch keine Clips gefunden. Starte eine Analyse oder verbinde
                  eine Plattform, damit hier echte Ergebnisse erscheinen.
                </td>
              </tr>
            ) : (
              clipRows.map((clip) => (
                <tr key={clip.id}>
                  <td className="px-4 py-3">
                    <div className="flex gap-3">
                      {clip.thumbnailUrl ? (
                        <div
                          aria-hidden="true"
                          className="h-12 w-20 shrink-0 overflow-hidden rounded-md border border-white/10 bg-white/5 bg-cover bg-center"
                          style={{
                            backgroundImage: `url(${clip.thumbnailUrl})`,
                          }}
                        />
                      ) : (
                        <div className="h-12 w-20 shrink-0 rounded-md border border-white/10 bg-white/5" />
                      )}
                      <div className="min-w-0">
                        <div className="font-medium text-white">
                          {clip.href ? (
                            <a
                              className="hover:text-signal-green"
                              href={clip.href}
                              rel="noreferrer"
                              target="_blank"
                            >
                              {clip.title}
                            </a>
                          ) : (
                            clip.title
                          )}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          {clip.hook}
                        </div>
                        <div className="mt-1 text-[11px] uppercase tracking-[0.08em] text-slate-500">
                          {clip.createdAtLabel}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-300">
                    {clip.platformLabel}
                  </td>
                  <td className="px-4 py-3 text-slate-300">
                    {clip.statusLabel}
                  </td>
                  <td className="px-4 py-3 font-semibold text-signal-green">
                    {clip.scoreLabel}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
