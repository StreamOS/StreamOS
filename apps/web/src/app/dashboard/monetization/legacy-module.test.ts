import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("legacy monetization module cleanup", () => {
  it("removes the deprecated dashboard/modules/monetization path", () => {
    const legacyModulePath = path.resolve(
      process.cwd(),
      "src/app/dashboard/modules/monetization",
    );

    expect(existsSync(legacyModulePath)).toBe(false);
  });
});
