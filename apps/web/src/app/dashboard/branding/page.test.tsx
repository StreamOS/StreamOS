import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import BrandingPage from "./page";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const mockGetBrandKitDashboardData = vi.hoisted(() => vi.fn());

vi.mock("./data", () => ({
  getBrandKitDashboardData: mockGetBrandKitDashboardData,
}));

vi.mock("@/lib/supabase/config", () => ({
  isSupabaseConfigured: vi.fn(),
}));

const mockIsSupabaseConfigured = vi.mocked(isSupabaseConfigured);

describe("branding page", () => {
  it("renders the CRUD surface and loaded brand kit data", async () => {
    mockIsSupabaseConfigured.mockReturnValue(true);
    mockGetBrandKitDashboardData.mockResolvedValue({
      activeAssets: 1,
      archivedAssets: 0,
      assets: [
        {
          asset_type: "overlay",
          config: {
            primaryColor: "#00d4aa",
            secondaryColor: "#9b5cff",
          },
          created_at: "2026-06-10T10:00:00.000Z",
          id: "brand-asset-1",
          name: "Neon Overlay",
          metadata: {
            file_name: "neon-overlay.png",
            source: "upload",
          },
          public_url: "https://storage.example/brand-assets/neon-overlay.png",
          status: "active",
          storage_bucket: "brand-assets",
          storage_path: "user-1/overlay/brand-asset-1/neon-overlay.png",
          updated_at: "2026-06-10T10:30:00.000Z",
        },
      ],
      draftAssets: 0,
      totalAssets: 1,
      userId: "user-1",
    });

    const html = renderToStaticMarkup(
      await BrandingPage({
        searchParams: Promise.resolve({
          status: "brand-kit-created",
        }),
      }),
    );

    expect(html).toContain("Brand Kit wurde erstellt");
    expect(html).toContain("Neon Overlay");
    expect(html).toContain("Brand Kits");
    expect(html).toContain("Datei als Brand Asset hochladen");
    expect(html).toContain("Live Preview");
    expect(html).toContain("Empfohlene Felder");
    expect(html).toContain("Token-Chips");
    expect(html).toContain("Safe Area 16px");
    expect(html).toContain("Overlay");
    expect(html).toContain("primaryColor");
    expect(html).toContain("Datei oeffnen");
  });

  it("prefills the create form from a preset template", async () => {
    mockIsSupabaseConfigured.mockReturnValue(true);
    mockGetBrandKitDashboardData.mockResolvedValue({
      activeAssets: 0,
      archivedAssets: 0,
      assets: [],
      draftAssets: 0,
      totalAssets: 0,
      userId: "user-1",
    });

    const html = renderToStaticMarkup(
      await BrandingPage({
        searchParams: Promise.resolve({
          template: "neon-tactical",
        }),
      }),
    );

    expect(html).toContain("Vorlage aktiv: Neon Tactical");
    expect(html).toContain("Neon Tactical");
    expect(html).toContain("Space Grotesk");
  });

  it("renders the demo setup notice when Supabase is not configured", async () => {
    mockIsSupabaseConfigured.mockReturnValue(false);
    mockGetBrandKitDashboardData.mockResolvedValue({
      activeAssets: 0,
      archivedAssets: 0,
      assets: [],
      draftAssets: 0,
      totalAssets: 0,
      userId: null,
    });

    const html = renderToStaticMarkup(
      await BrandingPage({
        searchParams: Promise.resolve({}),
      }),
    );

    expect(html).toContain("Supabase noch nicht konfiguriert");
    expect(html).toContain("Demo-Modus");
  });
});
