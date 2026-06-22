import { describe, expect, it } from "vitest";

import {
  parseBrandKitAssetId,
  parseBrandKitFormData,
  serializeBrandKitConfig,
  summarizeBrandKitConfig,
} from "./brand-kit";

describe("brand-kit helpers", () => {
  it("parses valid brand kit form data", () => {
    const formData = new FormData();
    formData.set("assetType", "overlay");
    formData.set("configJson", '{"primaryColor":"#00d4aa"}');
    formData.set("description", "Main stream overlay.");
    formData.set("name", "Neon Overlay");
    formData.set("status", "active");

    expect(parseBrandKitFormData(formData)).toEqual({
      ok: true,
      values: {
        assetType: "overlay",
        config: {
          primaryColor: "#00d4aa",
        },
        description: "Main stream overlay.",
        id: null,
        name: "Neon Overlay",
        status: "active",
      },
    });
  });

  it("rejects invalid config JSON", () => {
    const formData = new FormData();
    formData.set("assetType", "overlay");
    formData.set("configJson", "not-json");
    formData.set("name", "Neon Overlay");
    formData.set("status", "draft");

    expect(parseBrandKitFormData(formData)).toEqual({
      error: "invalid-brand-kit-config",
      ok: false,
    });
  });

  it("rejects invalid asset ids for destructive actions", () => {
    const formData = new FormData();
    formData.set("brandAssetId", "not-a-uuid");

    expect(parseBrandKitAssetId(formData)).toEqual({
      error: "invalid-brand-kit-form",
      ok: false,
    });
  });

  it("summarizes and serializes brand kit config safely", () => {
    expect(
      summarizeBrandKitConfig({
        accentColor: "#9b5cff",
        nested: {
          safeArea: "16px",
        },
        primaryColor: "#00d4aa",
        secondaryColor: "#ff4e6a",
      }),
    ).toBe(
      "accentColor: #9b5cff | nested: {...} | primaryColor: #00d4aa | ...",
    );

    expect(serializeBrandKitConfig({ primaryColor: "#00d4aa" })).toContain(
      '"primaryColor": "#00d4aa"',
    );
  });
});
