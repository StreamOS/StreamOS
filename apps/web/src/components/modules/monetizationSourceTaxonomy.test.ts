import { describe, expect, it } from "vitest";
import {
  getMonetizationSourceCategoryLabel,
  normalizeMonetizationSourceCategory,
  resolveBreakdownCategory,
} from "./monetizationSourceTaxonomy";

describe("monetizationSourceTaxonomy", () => {
  it("maps known raw sources into canonical source categories", () => {
    expect(normalizeMonetizationSourceCategory("prime_sub")).toBe(
      "subscriptions",
    );
    expect(normalizeMonetizationSourceCategory("tier_1_sub")).toBe(
      "subscriptions",
    );
    expect(normalizeMonetizationSourceCategory("brand_campaign")).toBe(
      "sponsorships",
    );
    expect(normalizeMonetizationSourceCategory("merch_store")).toBe("merch");
    expect(normalizeMonetizationSourceCategory("super_chat")).toBe(
      "platform_revenue",
    );
  });

  it("treats unknown or missing raw sources conservatively", () => {
    expect(normalizeMonetizationSourceCategory("mystery_drop")).toBe("unknown");
    expect(normalizeMonetizationSourceCategory("")).toBe("unknown");
    expect(normalizeMonetizationSourceCategory(null)).toBe("unknown");
  });

  it("maps summary fallback keys into canonical categories without inventing raw sources", () => {
    expect(
      resolveBreakdownCategory({
        dimension: "summary_category",
        key: "subscription",
        rawSource: null,
      }),
    ).toBe("subscriptions");
    expect(
      resolveBreakdownCategory({
        dimension: "summary_category",
        key: "tip",
        rawSource: null,
      }),
    ).toBe("donations");
    expect(getMonetizationSourceCategoryLabel("platform_revenue")).toBe(
      "Platform Revenue",
    );
  });
});
