import { describe, expect, it } from "vitest";
import {
  getBrandKitPresetTemplate,
  resolveBrandKitTemplateSelection,
} from "./brand-kit-presets";

describe("brand kit presets", () => {
  it("returns built-in preset defaults by key", () => {
    const preset = getBrandKitPresetTemplate("neon-tactical");

    expect(preset).toMatchObject({
      key: "neon-tactical",
      label: "Neon Tactical",
    });
    expect(preset?.defaults).toMatchObject({
      assetType: "overlay",
      name: "Neon Tactical",
      status: "draft",
    });
  });

  it("resolves a brand kit selection from an existing asset", () => {
    const selection = resolveBrandKitTemplateSelection({
      assets: [
        {
          asset_type: "banner",
          config: {
            primaryColor: "#ffffff",
          },
          created_at: "2026-06-10T10:00:00.000Z",
          id: "11111111-1111-4111-8111-111111111111",
          name: "Summer Splash",
          metadata: {},
          public_url: null,
          status: "active",
          storage_bucket: null,
          storage_path: null,
          updated_at: "2026-06-10T10:30:00.000Z",
        },
      ],
      templateKey: "11111111-1111-4111-8111-111111111111",
    });

    expect(selection).toMatchObject({
      description: "Vorlage aus einem bestehenden Brand Kit.",
      key: "11111111-1111-4111-8111-111111111111",
      label: "Summer Splash",
      source: "brand-kit",
    });
    expect(selection?.defaults).toMatchObject({
      assetType: "banner",
      name: "Summer Splash Copy",
      status: "draft",
    });
  });
});
