import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MobileHeaderMenuLinks } from "./TopHeader";

describe("TopHeader mobile navigation", () => {
  it("keeps platforms reachable in the mobile header menu", () => {
    const html = renderToStaticMarkup(<MobileHeaderMenuLinks />);

    expect(html).toContain('href="/dashboard/platforms"');
    expect(html).toContain("Platforms");
    expect(html).toContain('href="/dashboard/monetization"');
    expect(html).toContain("Monetization");
  });
});
