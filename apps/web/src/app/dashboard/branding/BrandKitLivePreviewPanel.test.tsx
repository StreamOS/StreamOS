import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BrandKitLivePreviewPanel } from "./BrandKitLivePreviewPanel";

describe("BrandKitLivePreviewPanel", () => {
  it("renders a live preview for valid config JSON", () => {
    const html = renderToStaticMarkup(
      <BrandKitLivePreviewPanel
        assetType="overlay"
        configJson='{"primaryColor":"#00d4aa","accentColor":"#9b5cff","safeArea":"16px"}'
        name="Neon Overlay"
        status="active"
      />,
    );

    expect(html).toContain("Live Preview");
    expect(html).toContain("Neon Overlay");
    expect(html).toContain("Token-Felder");
    expect(html).toContain("Layout Preset");
    expect(html).toContain("Overlay Layout");
    expect(html).toContain("primaryColor");
    expect(html).toContain("safeArea");
    expect(html).toContain("#00d4aa");
    expect(html).toContain("Empfohlene Tokens");
    expect(html).toContain("Overlay");
  });

  it("renders a banner layout preset for banner assets", () => {
    const html = renderToStaticMarkup(
      <BrandKitLivePreviewPanel
        assetType="banner"
        configJson='{"primaryColor":"#0f172a","secondaryColor":"#1d4ed8","safeArea":"24px"}'
        name="Hero Banner"
        status="active"
      />,
    );

    expect(html).toContain("Banner Layout");
    expect(html).toContain("Banner Preset");
    expect(html).toContain("16:5 Header");
    expect(html).toContain("Promo-ready");
    expect(html).toContain("Safe Area 24px");
  });

  it("renders a logo layout preset for logo assets", () => {
    const html = renderToStaticMarkup(
      <BrandKitLivePreviewPanel
        assetType="logo"
        configJson='{"primaryColor":"#0f172a","secondaryColor":"#1d4ed8"}'
        name="StreamOS"
        status="draft"
      />,
    );

    expect(html).toContain("Logo Layout");
    expect(html).toContain("Kompaktes Logo-Preset");
    expect(html).toContain("SO");
  });

  it("renders an inline error for invalid JSON", () => {
    const html = renderToStaticMarkup(
      <BrandKitLivePreviewPanel
        assetType="logo"
        configJson='{"primaryColor":"#00d4aa"'
        name=""
        status="draft"
      />,
    );

    expect(html).toContain("Config JSON ist ungueltig");
    expect(html).toContain("Unbenanntes Brand Kit");
  });
});
