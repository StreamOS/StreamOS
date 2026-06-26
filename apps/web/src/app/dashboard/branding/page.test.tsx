import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BrandingPage from "./page";
import {
  buildBrandingDashboardModel,
  createEmptyBrandingDashboardModel,
} from "@/components/modules/BrandingDashboardConsole.utils";

const mocks = vi.hoisted(() => ({
  getBrandingDashboardData: vi.fn(),
  uploadBrandAssetAction: vi.fn(),
}));

vi.mock("./data", () => ({
  getBrandingDashboardData: mocks.getBrandingDashboardData,
}));

vi.mock("./actions", () => ({
  uploadBrandAssetAction: mocks.uploadBrandAssetAction,
}));

describe("BrandingPage", () => {
  beforeEach(() => {
    mocks.getBrandingDashboardData.mockReset();
    mocks.uploadBrandAssetAction.mockReset();
  });

  it("renders the upload surface without destructive actions when no brand assets exist yet", async () => {
    mocks.getBrandingDashboardData.mockResolvedValue(
      createEmptyBrandingDashboardModel("user-1"),
    );

    const html = renderToStaticMarkup(await BrandingPage());

    expect(html).toContain("Branding MVP");
    expect(html).toContain("Brand Asset Upload");
    expect(html).toContain("Noch keine Brand Assets");
    expect(html).toContain("Brand Asset hochladen");
    expect(html).toContain("Future Mutation Contract");
    expect(html).toContain("Orphan Cleanup");
    expect(html).toContain('type="file"');
    expect(html).toContain("Maximale Groesse: 5 MB");
    expect(html).toContain("kurzlebig signiert");
    expect(html).not.toContain("formaction=");
    expect(html).toContain("blocked");
    expect(html).not.toContain("Replace spaeter");
    expect(html).not.toContain("Delete spaeter");
    expect(html).not.toContain("Asset bearbeiten");
    expect(html).not.toContain("loeschen");
  });

  it("renders existing assets with stable unknown type labels and without public URLs", async () => {
    const model = buildBrandingDashboardModel({
      feed: {
        hasMore: false,
        limit: 12,
        returnedCount: 2,
      },
      items: [
        {
          assetType: "overlay",
          channelId: "channel-1",
          createdAt: "2026-06-26T08:00:00.000Z",
          description: "Main overlay.",
          id: "asset-1",
          name: "Neon Overlay",
          platform: "twitch",
          preview: {
            expiresAt: "2026-06-26T10:01:00.000Z",
            reason: null,
            status: "available",
            url: "https://signed.example/preview-1",
          },
          status: "active",
          storageState: "attached",
          updatedAt: "2026-06-26T10:00:00.000Z",
          usageContext: "NovaPlays Live",
        },
        {
          assetType: "mystery_pack",
          channelId: null,
          createdAt: "2026-06-25T08:00:00.000Z",
          description: null,
          id: "asset-2",
          name: "Mystery Pack",
          platform: null,
          preview: {
            expiresAt: null,
            reason: "unsupported_file_type",
            status: "unsupported",
            url: null,
          },
          status: "draft",
          storageState: "incomplete",
          updatedAt: "2026-06-25T10:00:00.000Z",
          usageContext: null,
        },
      ],
      lookupIssues: [],
      state: "ready",
      userId: "user-2",
    });

    mocks.getBrandingDashboardData.mockResolvedValue(model);

    const html = renderToStaticMarkup(await BrandingPage());

    expect(html).toContain("Neon Overlay");
    expect(html).toContain("Mystery Pack");
    expect(html).toContain("mystery_pack");
    expect(html).toContain("Private Datei verknuepft");
    expect(html).toContain("Storage-Metadaten unvollstaendig");
    expect(html).toContain("Twitch");
    expect(html).toContain("Globales Brand Asset");
    expect(html).toContain("Replace spaeter");
    expect(html).toContain("Delete spaeter");
    expect(html).toContain("Contract only");
    expect(html).toContain("blocked");
    expect(html).toContain('alt="Neon Overlay preview"');
    expect(html).toContain("Kurzlebige Preview fuer diese Dashboard-Response");
    expect(html).toContain("Kein gerendertes Thumbnail");
    expect(html).not.toContain("brand-assets/");
    expect(html).not.toContain("public_url");
    expect(html).not.toContain("Storage-Bucket erstellen");
  });

  it("renders upload error feedback without exposing raw storage details", async () => {
    mocks.getBrandingDashboardData.mockResolvedValue(
      createEmptyBrandingDashboardModel("user-6"),
    );

    const html = renderToStaticMarkup(
      await BrandingPage({
        searchParams: Promise.resolve({
          error: "brand-asset-upload-failed",
        }),
      }),
    );

    expect(html).toContain("Der private Storage-Upload ist fehlgeschlagen");
    expect(html).not.toContain("storage.objects");
    expect(html).not.toContain("signed.example");
  });

  it("renders cleanup failure feedback without exposing private storage details", async () => {
    mocks.getBrandingDashboardData.mockResolvedValue(
      createEmptyBrandingDashboardModel("user-7"),
    );

    const html = renderToStaticMarkup(
      await BrandingPage({
        searchParams: Promise.resolve({
          error: "brand-asset-cleanup-failed",
        }),
      }),
    );

    expect(html).toContain(
      "Der Upload konnte nach einem Persistenzfehler nicht vollstaendig rueckabgewickelt werden",
    );
    expect(html).not.toContain("brand-assets/");
    expect(html).not.toContain("signed.example");
  });

  it("renders a hard load-failed state separately from the empty state", async () => {
    mocks.getBrandingDashboardData.mockResolvedValue(
      createEmptyBrandingDashboardModel("user-3", "load-failed"),
    );

    const html = renderToStaticMarkup(await BrandingPage());

    expect(html).toContain("Brand Assets konnten nicht geladen werden");
    expect(html).not.toContain("Noch keine Brand Assets");
  });

  it("renders partial lookup failures without crashing the asset list", async () => {
    const model = buildBrandingDashboardModel({
      feed: {
        hasMore: false,
        limit: 12,
        returnedCount: 1,
      },
      items: [
        {
          assetType: "logo",
          channelId: "channel-1",
          createdAt: "2026-06-26T08:00:00.000Z",
          description: "Primary logo.",
          id: "asset-1",
          name: "Neon Logo",
          platform: null,
          preview: {
            expiresAt: null,
            reason: "missing_storage",
            status: "unavailable",
            url: null,
          },
          status: "active",
          storageState: "none",
          updatedAt: "2026-06-26T10:00:00.000Z",
          usageContext: null,
        },
      ],
      lookupIssues: [
        {
          code: "load-failed",
          source: "channels",
        },
      ],
      state: "ready",
      userId: "user-4",
    });

    mocks.getBrandingDashboardData.mockResolvedValue(model);

    const html = renderToStaticMarkup(await BrandingPage());

    expect(html).toContain(
      "Einige optionale Branding-Lookups konnten nicht geladen werden",
    );
    expect(html).toContain("Neon Logo");
    expect(html).toContain("Kein Plattformkontext");
  });

  it("keeps a single preview failure local to the asset instead of rendering the global load-failed state", async () => {
    const model = buildBrandingDashboardModel({
      feed: {
        hasMore: false,
        limit: 12,
        returnedCount: 2,
      },
      items: [
        {
          assetType: "logo",
          channelId: null,
          createdAt: "2026-06-26T08:00:00.000Z",
          description: "Primary logo.",
          id: "asset-1",
          name: "Neon Logo",
          platform: null,
          preview: {
            expiresAt: "2026-06-26T10:01:00.000Z",
            reason: null,
            status: "available",
            url: "https://signed.example/preview-1",
          },
          status: "active",
          storageState: "attached",
          updatedAt: "2026-06-26T10:00:00.000Z",
          usageContext: null,
        },
        {
          assetType: "overlay",
          channelId: null,
          createdAt: "2026-06-26T08:00:00.000Z",
          description: "Secondary overlay.",
          id: "asset-2",
          name: "Fallback Overlay",
          platform: null,
          preview: {
            expiresAt: null,
            reason: "signing_failed",
            status: "failed",
            url: null,
          },
          status: "draft",
          storageState: "attached",
          updatedAt: "2026-06-26T10:00:00.000Z",
          usageContext: null,
        },
      ],
      lookupIssues: [],
      state: "ready",
      userId: "user-5",
    });

    mocks.getBrandingDashboardData.mockResolvedValue(model);

    const html = renderToStaticMarkup(await BrandingPage());

    expect(html).toContain("Neon Logo");
    expect(html).toContain("Fallback Overlay");
    expect(html).toContain("Preview konnte nicht erzeugt werden");
    expect(html).not.toContain("Brand Assets konnten nicht geladen werden");
  });

  it("renders a safe setup notice when branding is disabled", async () => {
    mocks.getBrandingDashboardData.mockResolvedValue(
      createEmptyBrandingDashboardModel(null, "disabled"),
    );

    const html = renderToStaticMarkup(await BrandingPage());

    expect(html).toContain("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
    expect(html).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});
