import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  BrandKitConfigTokenChips,
  applyBrandKitConfigToken,
  brandKitConfigTokenChips,
} from "./brand-kit-config-tokens";

describe("brand-kit-config-tokens", () => {
  it("merges a token chip into existing config JSON", () => {
    const next = applyBrandKitConfigToken(
      '{"primaryColor":"#ff0000","safeArea":"24px"}',
      brandKitConfigTokenChips.find((chip) => chip.key === "accentColor")!,
    );

    expect(next).toContain('"primaryColor": "#ff0000"');
    expect(next).toContain('"safeArea": "24px"');
    expect(next).toContain('"accentColor": "#9b5cff"');
  });

  it("renders quick-fill token chips for the editor", () => {
    const html = renderToStaticMarkup(
      <BrandKitConfigTokenChips onChange={() => undefined} value="" />,
    );

    expect(html).toContain("Token-Chips");
    expect(html).toContain("Colors");
    expect(html).toContain("Layout");
    expect(html).toContain("Typography");
    expect(html).toContain("Primary");
    expect(html).toContain("safeArea");
    expect(html).toContain("16px");
  });
});
