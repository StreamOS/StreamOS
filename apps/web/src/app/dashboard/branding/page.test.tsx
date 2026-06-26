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

type BrandingPageAsset = Parameters<
  typeof buildBrandingDashboardModel
>[0]["items"][number];

describe("BrandingPage", () => {
  beforeEach(() => {
    mocks.getBrandingDashboardData.mockReset();
    mocks.uploadBrandAssetAction.mockReset();
  });

  it("renders the upload and explorer surfaces without enabling destructive actions when no brand assets exist yet", async () => {
    mocks.getBrandingDashboardData.mockResolvedValue(
      createEmptyBrandingDashboardModel("user-1"),
    );

    const html = renderToStaticMarkup(await BrandingPage());

    expect(html).toContain("Branding MVP");
    expect(html).toContain("Brand Asset Upload");
    expect(html).toContain("Asset Explorer");
    expect(html).toContain("Asset Detail");
    expect(html).toContain("Noch keine Brand Assets");
    expect(html).toContain("Brand Asset hochladen");
    expect(html).toContain("Future Mutation Contract");
    expect(html).toContain("Orphan Cleanup");
    expect(html).toContain("Filter anwenden");
    expect(html).toContain("Filter zuruecksetzen");
    expect(html).toContain("Maximale Groesse: 5 MB");
    expect(html).toContain("kurzlebig signiert");
    expect(html).toContain("blocked");
    expect(html).toContain('type="file"');
    expect(html).not.toContain("formaction=");
    expect(html).not.toContain("Asset bearbeiten");
    expect(html).not.toContain("loeschen");
  });

  it("renders a read-only asset detail panel with safe metadata and disabled future actions", async () => {
    mocks.getBrandingDashboardData.mockResolvedValue(
      createReadyModel([
        createAsset({
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
            url: "https://assets.local/preview-1",
          },
          storageState: "attached",
          updatedAt: "2026-06-26T10:00:00.000Z",
          uploadMetadata: {
            contentType: "image/png",
            fileExtension: "png",
            fileSizeBytes: 2048,
            status: "available",
            storedFilename: "neon-overlay.png",
          },
          usageContext: "NovaPlays Live",
        }),
        createAsset({
          assetType: "mystery_pack",
          createdAt: "2026-06-25T08:00:00.000Z",
          description: null,
          id: "asset-2",
          name: "Mystery Pack",
          preview: {
            expiresAt: null,
            reason: "unsupported_file_type",
            status: "unsupported",
            url: null,
          },
          status: "draft",
          storageState: "incomplete",
          updatedAt: "2026-06-25T10:00:00.000Z",
          uploadMetadata: {
            contentType: null,
            fileExtension: null,
            fileSizeBytes: null,
            status: "unavailable",
            storedFilename: null,
          },
          usageContext: null,
        }),
      ]),
    );

    const html = renderToStaticMarkup(await BrandingPage());

    expect(html).toContain("Asset Explorer");
    expect(html).toContain("Asset Detail");
    expect(html).toContain("Neon Overlay");
    expect(html).toContain("Mystery Pack");
    expect(html).toContain("Details ansehen");
    expect(html).toContain('alt="Neon Overlay preview"');
    expect(html).toContain("PNG (image/png)");
    expect(html).toContain("neon-overlay.png");
    expect(html).toContain("Twitch");
    expect(html).toContain("NovaPlays Live");
    expect(html).toContain("Replace");
    expect(html).toContain("Delete");
    expect(html).toContain("Orphan Cleanup");
    expect(html).toContain("blocked");
    expect(html).toContain(
      "Kurzlebige Preview nur fuer diese Dashboard-Response",
    );
    expect(html).toContain("Metadata nicht verfuegbar");
    expect(html).not.toContain("brand-assets/");
    expect(html).not.toContain("public_url");
    expect(html).not.toContain("storage_path");
  });

  it("applies read-only filters and detail selection from search params", async () => {
    mocks.getBrandingDashboardData.mockResolvedValue(
      createReadyModel(
        [
          createAsset({
            assetType: "logo",
            createdAt: "2026-06-26T07:00:00.000Z",
            id: "asset-1",
            name: "Neon Logo",
            preview: {
              expiresAt: "2026-06-26T10:01:00.000Z",
              reason: null,
              status: "available",
              url: "https://assets.local/preview-logo",
            },
            updatedAt: "2026-06-26T10:00:00.000Z",
            uploadMetadata: {
              contentType: "image/png",
              fileExtension: "png",
              fileSizeBytes: 1024,
              status: "available",
              storedFilename: "neon-logo.png",
            },
          }),
        ],
        [],
        {
          serverFilters: {
            assetType: "logo",
            status: "active",
          },
          serverSort: "created_desc",
        },
      ),
    );

    const html = renderToStaticMarkup(
      await BrandingPage({
        searchParams: Promise.resolve({
          asset: "asset-1",
          assetType: "logo",
          metadata: "available",
          preview: "available",
          sort: "created_desc",
          statusFilter: "active",
        }),
      }),
    );

    expect(html).toContain(
      'Sortierung: <span class="font-semibold text-white">Zuletzt erstellt</span>',
    );
    expect(html).toContain(
      'Zeige <span class="font-semibold text-white">1</span> von 1 Assets im Feed',
    );
    expect(html).toContain("Neon Logo");
    expect(html).toContain('alt="Neon Logo preview"');
    expect(html).not.toContain(
      "Passe Asset Type, Status, Preview oder Metadata-Filter an",
    );
    expect(mocks.getBrandingDashboardData).toHaveBeenCalledWith({
      assetType: "logo",
      cursor: null,
      cursorServerFilters: null,
      cursorServerSort: null,
      serverSort: "created_desc",
      status: "active",
      windowCount: 1,
    });
  });

  it("renders a filtered empty state when the current feed has no matching assets", async () => {
    mocks.getBrandingDashboardData.mockResolvedValue(
      createReadyModel([
        createAsset({
          assetType: "overlay",
          id: "asset-1",
          name: "Overlay Only",
          preview: {
            expiresAt: null,
            reason: "signing_failed",
            status: "failed",
            url: null,
          },
          status: "draft",
          uploadMetadata: {
            contentType: null,
            fileExtension: null,
            fileSizeBytes: null,
            status: "unavailable",
            storedFilename: null,
          },
        }),
      ]),
    );

    const html = renderToStaticMarkup(
      await BrandingPage({
        searchParams: Promise.resolve({
          preview: "available",
        }),
      }),
    );

    expect(html).toContain("Keine Assets fuer aktuelle Filter");
    expect(html).toContain("Kein Detail verfuegbar");
  });

  it("keeps a server-filtered empty state separate from the true empty dashboard state", async () => {
    mocks.getBrandingDashboardData.mockResolvedValue(
      createReadyModel([], [], {
        serverFilters: {
          assetType: "logo",
          status: null,
        },
      }),
    );

    const html = renderToStaticMarkup(
      await BrandingPage({
        searchParams: Promise.resolve({
          assetType: "logo",
        }),
      }),
    );

    expect(html).toContain("Keine Assets fuer aktuelle Filter");
    expect(html).not.toContain("Noch keine Brand Assets");
  });

  it("communicates loaded-sample scope when more assets exist outside the current feed window", async () => {
    mocks.getBrandingDashboardData.mockResolvedValue(
      createReadyModel(
        [
          createAsset({
            id: "asset-1",
            name: "Newest Logo",
          }),
        ],
        [],
        {
          hasMore: true,
          limit: 12,
          nextCursor: {
            assetType: null,
            createdAt: null,
            id: "asset-1",
            status: null,
            updatedAt: "2026-06-26T10:00:00.000Z",
          },
          returnedCount: 1,
          serverFilters: {
            assetType: null,
            status: null,
          },
          scope: "loaded_sample",
          serverSort: "updated_desc",
        },
      ),
    );

    const html = renderToStaticMarkup(await BrandingPage());

    expect(html).toContain("Geladene Stichprobe");
    expect(html).toContain(
      "Serverseitige Asset-Type-/Status-Filter und die Sortierung Zuletzt aktualisiert wirken auf das aktuelle Query-Fenster mit 1 geladenen Brand Assets",
    );
    expect(html).toContain(
      "Weitere Assets im selben Query-Kontext sind vorhanden und koennen ueber `Mehr laden` schrittweise nachgeladen werden",
    );
  });

  it("renders a load-more link when the server feed exposes a next cursor", async () => {
    mocks.getBrandingDashboardData.mockResolvedValue(
      createReadyModel(
        [
          createAsset({
            assetType: "logo",
            id: "asset-1",
            name: "Newest Logo",
            preview: {
              expiresAt: "2026-06-26T10:01:00.000Z",
              reason: null,
              status: "available",
              url: "https://assets.local/preview-logo",
            },
            uploadMetadata: {
              contentType: "image/png",
              fileExtension: "png",
              fileSizeBytes: 1024,
              status: "available",
              storedFilename: "newest-logo.png",
            },
          }),
        ],
        [],
        {
          hasMore: true,
          limit: 12,
          nextCursor: {
            assetType: null,
            createdAt: null,
            id: "asset-12",
            status: null,
            updatedAt: "2026-06-26T10:00:00.000Z",
          },
          returnedCount: 12,
          serverFilters: {
            assetType: null,
            status: null,
          },
          scope: "loaded_sample",
          serverSort: "updated_desc",
        },
      ),
    );

    const html = renderToStaticMarkup(
      await BrandingPage({
        searchParams: Promise.resolve({
          asset: "asset-1",
          metadata: "available",
          preview: "available",
        }),
      }),
    );

    expect(html).toContain("Mehr laden");
    expect(html).toContain("window=2");
    expect(html).toContain("cursor=");
    expect(html).toContain("asset=asset-1");
    expect(html).toContain("preview=available");
    expect(html).toContain("metadata=available");
  });

  it("does not render a load-more link when the full feed is already visible", async () => {
    mocks.getBrandingDashboardData.mockResolvedValue(
      createReadyModel([
        createAsset({
          id: "asset-1",
          name: "Only Asset",
        }),
      ]),
    );

    const html = renderToStaticMarkup(await BrandingPage());

    expect(html).not.toContain("Mehr laden");
    expect(html).not.toContain("Weitere Assets laden");
  });

  it("normalizes invalid search params back to safe defaults", async () => {
    mocks.getBrandingDashboardData.mockResolvedValue(
      createReadyModel([
        createAsset({
          id: "asset-a",
          name: "Alpha Asset",
          updatedAt: "2026-06-26T10:00:00.000Z",
        }),
        createAsset({
          id: "asset-b",
          name: "Beta Asset",
          updatedAt: "2026-06-26T10:00:00.000Z",
        }),
      ]),
    );

    const html = renderToStaticMarkup(
      await BrandingPage({
        searchParams: Promise.resolve({
          assetType: "not-real",
          metadata: "broken",
          preview: "maybe",
          sort: "sideways",
          statusFilter: "ghost",
        }),
      }),
    );

    expect(html).toContain(
      'Sortierung: <span class="font-semibold text-white">Zuletzt aktualisiert</span>',
    );
    expect(html.indexOf("Alpha Asset")).toBeLessThan(
      html.indexOf("Beta Asset"),
    );
    expect(mocks.getBrandingDashboardData).toHaveBeenCalledWith({
      assetType: null,
      cursor: null,
      cursorServerFilters: null,
      cursorServerSort: null,
      serverSort: "updated_desc",
      status: null,
      windowCount: 1,
    });
  });

  it("normalizes invalid cursor params back to the first server window", async () => {
    mocks.getBrandingDashboardData.mockResolvedValue(
      createReadyModel([
        createAsset({
          id: "asset-a",
          name: "Alpha Asset",
        }),
      ]),
    );

    const html = renderToStaticMarkup(
      await BrandingPage({
        searchParams: Promise.resolve({
          cursor: "not-a-valid-token",
          window: "99",
        }),
      }),
    );

    expect(html).toContain("Alpha Asset");
    expect(mocks.getBrandingDashboardData).toHaveBeenCalledWith({
      assetType: null,
      cursor: null,
      cursorServerFilters: null,
      cursorServerSort: null,
      serverSort: "updated_desc",
      status: null,
      windowCount: 1,
    });
    expect(html).not.toContain("window=99");
  });

  it("falls back to the first visible asset when the requested detail asset is filtered out", async () => {
    mocks.getBrandingDashboardData.mockResolvedValue(
      createReadyModel([
        createAsset({
          assetType: "logo",
          id: "asset-1",
          name: "Visible Logo",
        }),
      ]),
    );

    const html = renderToStaticMarkup(
      await BrandingPage({
        searchParams: Promise.resolve({
          asset: "asset-2",
          assetType: "logo",
        }),
      }),
    );

    expect(html).toContain(
      "Das angeforderte Asset liegt nicht mehr im aktuell sichtbaren Feed",
    );
    expect(html).toContain("Visible Logo");
    expect(mocks.getBrandingDashboardData).toHaveBeenCalledWith({
      assetType: "logo",
      cursor: null,
      cursorServerFilters: null,
      cursorServerSort: null,
      serverSort: "updated_desc",
      status: null,
      windowCount: 1,
    });
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
    expect(html).not.toContain("brand-assets/");
  });

  it("renders a hard load-failed state separately from the empty state", async () => {
    mocks.getBrandingDashboardData.mockResolvedValue(
      createEmptyBrandingDashboardModel("user-3", "load-failed"),
    );

    const html = renderToStaticMarkup(await BrandingPage());

    expect(html).toContain("Brand Assets konnten nicht geladen werden");
    expect(html).not.toContain("Noch keine Brand Assets");
  });

  it("renders partial lookup failures without crashing the explorer or detail panel", async () => {
    mocks.getBrandingDashboardData.mockResolvedValue(
      createReadyModel(
        [
          createAsset({
            assetType: "logo",
            id: "asset-1",
            name: "Neon Logo",
            platform: null,
            preview: {
              expiresAt: null,
              reason: "missing_storage",
              status: "unavailable",
              url: null,
            },
            storageState: "none",
            uploadMetadata: {
              contentType: null,
              fileExtension: null,
              fileSizeBytes: null,
              status: "unavailable",
              storedFilename: null,
            },
            usageContext: null,
          }),
        ],
        [
          {
            code: "load-failed",
            source: "channels",
          },
        ],
      ),
    );

    const html = renderToStaticMarkup(await BrandingPage());

    expect(html).toContain(
      "Einige optionale Branding-Lookups konnten nicht geladen werden",
    );
    expect(html).toContain("Neon Logo");
    expect(html).toContain("Kein Plattformkontext");
    expect(html).toContain("Globales Brand Asset");
  });

  it("keeps a single preview failure local to the asset instead of rendering the global load-failed state", async () => {
    mocks.getBrandingDashboardData.mockResolvedValue(
      createReadyModel([
        createAsset({
          assetType: "logo",
          id: "asset-1",
          name: "Neon Logo",
          preview: {
            expiresAt: "2026-06-26T10:01:00.000Z",
            reason: null,
            status: "available",
            url: "https://assets.local/preview-1",
          },
          uploadMetadata: {
            contentType: "image/png",
            fileExtension: "png",
            fileSizeBytes: 2048,
            status: "available",
            storedFilename: "neon-logo.png",
          },
        }),
        createAsset({
          assetType: "overlay",
          id: "asset-2",
          name: "Fallback Overlay",
          preview: {
            expiresAt: null,
            reason: "signing_failed",
            status: "failed",
            url: null,
          },
          status: "draft",
          uploadMetadata: {
            contentType: "image/webp",
            fileExtension: "webp",
            fileSizeBytes: 4096,
            status: "available",
            storedFilename: "fallback-overlay.webp",
          },
        }),
      ]),
    );

    const html = renderToStaticMarkup(
      await BrandingPage({
        searchParams: Promise.resolve({
          asset: "asset-2",
        }),
      }),
    );

    expect(html).toContain("Neon Logo");
    expect(html).toContain("Fallback Overlay");
    expect(html).toContain("Preview konnte nicht erzeugt werden");
    expect(html).toContain("Kein gerendertes Thumbnail");
    expect(html).not.toContain("Brand Assets konnten nicht geladen werden");
    expect(html).not.toContain('alt="Neon Logo preview"');
  });

  it("renders invalid upload metadata without exposing path-like filenames", async () => {
    mocks.getBrandingDashboardData.mockResolvedValue(
      createReadyModel([
        createAsset({
          assetType: "logo",
          id: "asset-1",
          name: "Unsafe Logo",
          preview: {
            expiresAt: null,
            reason: "unsupported_file_type",
            status: "unsupported",
            url: null,
          },
          uploadMetadata: {
            contentType: "image/png",
            fileExtension: "png",
            fileSizeBytes: 1200,
            status: "invalid",
            storedFilename: null,
          },
        }),
      ]),
    );

    const html = renderToStaticMarkup(await BrandingPage());

    expect(html).toContain("Metadata ungueltig");
    expect(html).not.toContain("PNG (image/png)");
    expect(html).not.toContain("../unsafe-logo.png");
    expect(html).not.toContain("brand-assets/");
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

function createReadyModel(
  items: BrandingPageAsset[],
  lookupIssues: Array<{ code: "load-failed"; source: "channels" }> = [],
  feedOverrides?: Partial<
    ReturnType<typeof createEmptyBrandingDashboardModel>["feed"]
  >,
) {
  return buildBrandingDashboardModel({
    feed: {
      hasMore: false,
      limit: 12,
      nextCursor: null,
      returnedCount: items.length,
      serverFilters: {
        assetType: null,
        status: null,
      },
      scope: "full_result",
      serverSort: "updated_desc",
      ...feedOverrides,
    },
    items,
    lookupIssues,
    state: "ready",
    userId: "user-test",
  });
}

function createAsset(overrides: Partial<BrandingPageAsset>): BrandingPageAsset {
  return {
    assetType: "logo",
    channelId: null,
    createdAt: "2026-06-26T08:00:00.000Z",
    description: "Primary logo.",
    id: "asset-default",
    name: "Default Asset",
    platform: null,
    preview: {
      expiresAt: null,
      reason: "missing_storage",
      status: "unavailable",
      url: null,
    },
    status: "active",
    storageState: "attached",
    updatedAt: "2026-06-26T10:00:00.000Z",
    uploadMetadata: {
      contentType: null,
      fileExtension: null,
      fileSizeBytes: null,
      status: "unavailable",
      storedFilename: null,
    },
    usageContext: null,
    ...overrides,
  };
}
