import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BrandingPage from "./page";
import {
  buildBrandingDashboardModel,
  createEmptyBrandingDashboardModel,
} from "@/components/modules/BrandingDashboardConsole.utils";

const mocks = vi.hoisted(() => ({
  getBrandingDashboardData: vi.fn(),
}));

vi.mock("./data", () => ({
  getBrandingDashboardData: mocks.getBrandingDashboardData,
}));

describe("BrandingPage", () => {
  beforeEach(() => {
    mocks.getBrandingDashboardData.mockReset();
  });

  it("renders the empty read-only branding surface without upload or destructive actions", async () => {
    mocks.getBrandingDashboardData.mockResolvedValue(
      createEmptyBrandingDashboardModel("user-1"),
    );

    const html = renderToStaticMarkup(await BrandingPage());

    expect(html).toContain("Branding MVP");
    expect(html).toContain("Read-first Branding Surface");
    expect(html).toContain("Noch keine Brand Assets");
    expect(html).toContain(
      "keine Upload-, Replace-, Delete- oder Preview-Runtime",
    );
    expect(html).not.toContain('type="file"');
    expect(html).not.toContain("Brand Asset Upload");
    expect(html).not.toContain("Brand Kit erstellen");
    expect(html).not.toContain("Aenderungen speichern");
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
    expect(html).toContain("Mystery Pack");
    expect(html).toContain("Private Datei verknuepft");
    expect(html).toContain("Storage-Metadaten unvollstaendig");
    expect(html).toContain("Twitch");
    expect(html).toContain("Globales Brand Asset");
    expect(html).not.toContain("https://");
    expect(html).not.toContain("brand-assets/");
    expect(html).not.toContain("public_url");
    expect(html).not.toContain("Storage-Bucket erstellen");
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

  it("renders a safe setup notice when branding is disabled", async () => {
    mocks.getBrandingDashboardData.mockResolvedValue(
      createEmptyBrandingDashboardModel(null, "disabled"),
    );

    const html = renderToStaticMarkup(await BrandingPage());

    expect(html).toContain("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
    expect(html).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});
