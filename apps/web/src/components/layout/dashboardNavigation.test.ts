import { describe, expect, it } from "vitest";
import {
  dashboardNavItems,
  getDashboardPageLabel,
  mobileBottomNavItems,
  mobileHeaderNavItems,
} from "./dashboardNavigation";

describe("dashboardNavigation", () => {
  it("keeps monetization visible across desktop and mobile navigation surfaces", () => {
    expect(
      dashboardNavItems.some(
        (item) =>
          item.href === "/dashboard/monetization" &&
          item.label === "Monetization",
      ),
    ).toBe(true);
    expect(
      mobileBottomNavItems.some(
        (item) =>
          item.href === "/dashboard/monetization" &&
          item.label === "Monetization",
      ),
    ).toBe(true);
    expect(
      mobileHeaderNavItems.some(
        (item) =>
          item.href === "/dashboard/monetization" &&
          item.label === "Monetization",
      ),
    ).toBe(true);
  });

  it("keeps platforms reachable in the mobile header menu without promoting it into the bottom nav", () => {
    expect(
      dashboardNavItems.some(
        (item) =>
          item.href === "/dashboard/platforms" && item.label === "Platforms",
      ),
    ).toBe(true);
    expect(
      mobileHeaderNavItems.some(
        (item) =>
          item.href === "/dashboard/platforms" && item.label === "Platforms",
      ),
    ).toBe(true);
    expect(
      mobileBottomNavItems.some(
        (item) =>
          item.href === "/dashboard/platforms" && item.label === "Platforms",
      ),
    ).toBe(false);
  });

  it("resolves monetization labels for direct and nested dashboard paths", () => {
    expect(getDashboardPageLabel("/dashboard/monetization")).toBe(
      "Monetization",
    );
    expect(getDashboardPageLabel("/dashboard/monetization/detail")).toBe(
      "Monetization",
    );
  });
});
