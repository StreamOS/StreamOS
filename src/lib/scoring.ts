import type { ScoreSummary, WorkspaceState } from "@/types/streamos";

export function getScores(state: WorkspaceState): ScoreSummary {
  const connectedCount = state.platforms.filter((platform) => platform.connected).length;
  const clipBoost = Math.min(20, state.clips.length * 3);
  const discoverability = Math.min(96, 44 + connectedCount * 8 + clipBoost);
  const moneyTotal = state.money.reduce((sum, item) => sum + Number(item.amount), 0);
  const burnout = Math.min(
    88,
    Math.max(18, Number(state.profile.weeklyHours) * 2 + state.clips.length * 2 - connectedCount * 3)
  );

  return { connectedCount, discoverability, moneyTotal, burnout };
}
