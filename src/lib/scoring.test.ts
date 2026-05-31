import { describe, expect, it } from "vitest";
import { defaultWorkspace } from "@/data/defaultWorkspace";
import { getScores } from "@/lib/scoring";

describe("getScores", () => {
  it("derives dashboard scores from workspace activity", () => {
    const scores = getScores(defaultWorkspace);

    expect(scores.connectedCount).toBe(2);
    expect(scores.discoverability).toBe(66);
    expect(scores.moneyTotal).toBe(1930);
    expect(scores.burnout).toBe(34);
  });
});
