import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import BrandingPage from "./page";

const mocks = vi.hoisted(() => ({
  getBrandKitDashboardData: vi.fn(),
  isSupabaseConfigured: vi.fn(),
}));

vi.mock("./data", () => ({
  getBrandKitDashboardData: mocks.getBrandKitDashboardData,
}));

vi.mock("@/lib/supabase/config", () => ({
  isSupabaseConfigured: mocks.isSupabaseConfigured,
}));

describe("BrandingPage", () => {
  it("renders the empty brand kit state without upload controls", async () => {
    mocks.isSupabaseConfigured.mockReturnValue(true);
    mocks.getBrandKitDashboardData.mockResolvedValue({
      activeAssets: 0,
      archivedAssets: 0,
      assets: [],
      draftAssets: 0,
      error: null,
      totalAssets: 0,
      userId: "11111111-1111-4111-8111-111111111111",
    });

    const html = renderToStaticMarkup(
      await BrandingPage({ searchParams: Promise.resolve({}) }),
    );

    expect(html).toContain("Noch kein Brand Kit");
    expect(html).toContain("Brand Kit erstellen");
    expect(html).toContain("Kein Upload in diesem Slice");
    expect(html).not.toContain('type="file"');
    expect(html).not.toContain("Storage-Bucket erstellen");
  });

  it("renders existing brand kits with edit, delete, and preview surfaces", async () => {
    mocks.isSupabaseConfigured.mockReturnValue(true);
    mocks.getBrandKitDashboardData.mockResolvedValue({
      activeAssets: 1,
      archivedAssets: 0,
      assets: [
        {
          asset_type: "overlay",
          config: {
            primaryColor: "#00d4aa",
            secondaryColor: "#9b5cff",
            textColor: "#ffffff",
          },
          created_at: "2026-06-22T10:00:00.000Z",
          description: "Main stream overlay.",
          id: "22222222-2222-4222-8222-222222222222",
          metadata: {},
          name: "Neon Overlay",
          status: "active",
          updated_at: "2026-06-22T10:15:00.000Z",
        },
      ],
      draftAssets: 0,
      error: null,
      totalAssets: 1,
      userId: "11111111-1111-4111-8111-111111111111",
    });

    const html = renderToStaticMarkup(
      await BrandingPage({
        searchParams: Promise.resolve({ status: "brand-kit-updated" }),
      }),
    );

    expect(html).toContain("Brand Kit wurde aktualisiert");
    expect(html).toContain("Neon Overlay");
    expect(html).toContain("Main stream overlay.");
    expect(html).toContain("Bearbeiten");
    expect(html).toContain("Aenderungen speichern");
    expect(html).toContain("Brand Kit loeschen");
    expect(html).not.toContain('type="file"');
    expect(html).not.toContain('name="publicUrl"');
    expect(html).not.toContain('name="storagePath"');
  });

  it("renders a safe setup notice when Supabase is not configured", async () => {
    mocks.isSupabaseConfigured.mockReturnValue(false);
    mocks.getBrandKitDashboardData.mockResolvedValue({
      activeAssets: 0,
      archivedAssets: 0,
      assets: [],
      draftAssets: 0,
      error: null,
      totalAssets: 0,
      userId: null,
    });

    const html = renderToStaticMarkup(
      await BrandingPage({ searchParams: Promise.resolve({}) }),
    );

    expect(html).toContain("Supabase noch nicht konfiguriert");
    expect(html).toContain("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
    expect(html).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});
