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
  it("renders the upload UI with safe file guidance", async () => {
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
    expect(html).toContain("Brand Asset Upload");
    expect(html).toContain('type="file"');
    expect(html).toContain('accept="image/png,image/jpeg,image/webp"');
    expect(html).toContain("Erlaubte Formate: PNG, JPEG, WebP");
    expect(html).toContain("Maximale Groesse: 5 MB");
    expect(html).toContain("Private Assets ohne Public URLs");
    expect(html).not.toContain("Storage-Bucket erstellen");
    expect(html).not.toContain("SVG");
    expect(html).not.toContain("GIF");
  });

  it("renders existing brand kits with edit, stored-file delete, and preview surfaces", async () => {
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
          hasStoredFile: true,
          id: "22222222-2222-4222-8222-222222222222",
          metadata: {},
          name: "Neon Overlay",
          previewStatus: "available",
          previewUrl: "https://storage.example/signed-preview",
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
    expect(html).toContain("https://storage.example/signed-preview");
    expect(html).toContain("Bearbeiten");
    expect(html).toContain("Aenderungen speichern");
    expect(html).toContain("Datei und Brand Asset entfernen");
    expect(html).not.toContain('name="publicUrl"');
    expect(html).not.toContain('name="storagePath"');
  });

  it("keeps metadata-only delete copy separate from stored-file removal", async () => {
    mocks.isSupabaseConfigured.mockReturnValue(true);
    mocks.getBrandKitDashboardData.mockResolvedValue({
      activeAssets: 1,
      archivedAssets: 0,
      assets: [
        {
          asset_type: "overlay",
          config: {},
          created_at: "2026-06-22T10:00:00.000Z",
          description: "Metadata-only asset.",
          hasStoredFile: false,
          id: "22222222-2222-4222-8222-222222222222",
          metadata: {},
          name: "Metadata Overlay",
          previewStatus: "no_preview",
          previewUrl: null,
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
      await BrandingPage({ searchParams: Promise.resolve({}) }),
    );

    expect(html).toContain("Private Datei-Vorschau aktuell nicht verfuegbar");
    expect(html).toContain("Brand Kit loeschen");
    expect(html).not.toContain("Datei und Brand Asset entfernen");
  });

  it("renders sanitized upload status and errors", async () => {
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

    const successHtml = renderToStaticMarkup(
      await BrandingPage({
        searchParams: Promise.resolve({ status: "brand-asset-uploaded" }),
      }),
    );
    const errorHtml = renderToStaticMarkup(
      await BrandingPage({
        searchParams: Promise.resolve({
          error: "brand-asset-file-type-not-supported",
        }),
      }),
    );

    expect(successHtml).toContain("Brand Asset wurde hochgeladen.");
    expect(errorHtml).toContain(
      "Dieses Dateiformat wird fuer Brand Assets nicht unterstuetzt.",
    );
    expect(errorHtml).not.toContain("private storage detail");
    expect(errorHtml).not.toContain("StorageError");
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
