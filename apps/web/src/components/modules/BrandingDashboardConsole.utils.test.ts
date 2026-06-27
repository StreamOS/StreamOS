import { BRANDING_DASHBOARD_DERIVED_STATUS_QUERY_GATE } from "@streamos/types";
import { describe, expect, it } from "vitest";
import {
  BRANDING_DASHBOARD_P514_DERIVED_STATUS_QUERY_GATE,
  buildBrandingDashboardViewModel,
  createEmptyBrandingDashboardModel,
  decodeBrandingDashboardCursorToken,
  encodeBrandingDashboardCursorToken,
  type BrandingDashboardState,
} from "./BrandingDashboardConsole.utils";

describe("buildBrandingDashboardViewModel", () => {
  it("keeps the shared derived-status gate fail-closed and activates P5.14 explicitly in the web slice", () => {
    expect(BRANDING_DASHBOARD_DERIVED_STATUS_QUERY_GATE).toMatchObject({
      blockedBy: [
        "requires_hosted_migration_evidence",
        "requires_server_filter_activation",
      ],
      metadataServerQueryable: false,
      previewServerQueryable: false,
      readiness: {
        hostedIndexReady: false,
        hostedMigrationReady: false,
        repoReady: true,
        serverFilterReady: false,
      },
    });
    expect(BRANDING_DASHBOARD_P514_DERIVED_STATUS_QUERY_GATE).toMatchObject({
      blockedBy: [],
      metadataServerQueryable: true,
      previewServerQueryable: true,
      readiness: {
        hostedIndexReady: true,
        hostedMigrationReady: true,
        repoReady: true,
        serverFilterReady: true,
      },
    });
  });

  it.each<BrandingDashboardState>([
    "ready",
    "load-failed",
    "unauthorized",
    "auth-failed",
    "disabled",
  ])(
    "preserves URL-driven server filter and sort state for %s models",
    (state) => {
      const model = createEmptyBrandingDashboardModel("user-1", state);

      const view = buildBrandingDashboardViewModel(model, {
        assetType: "logo",
        cursorToken: null,
        detailAssetId: null,
        metadata: "invalid",
        preview: "unavailable",
        sort: "created_desc",
        status: "draft",
        windowCount: 1,
      });

      expect(view.feed.hasActiveServerFilters).toBe(true);
      expect(view.feed.filterOwnership).toEqual({
        assetType: "server_query",
        metadata: "server_query",
        preview: "server_query",
        status: "server_query",
      });
      expect(view.feed.derivedStatusQueryGate).toEqual(
        BRANDING_DASHBOARD_P514_DERIVED_STATUS_QUERY_GATE,
      );
      expect(view.feed.serverFilters).toEqual({
        assetType: "logo",
        metadata: "invalid",
        preview: "unavailable",
        status: "draft",
      });
      expect(view.filters).toEqual({
        assetType: "logo",
        metadata: "invalid",
        preview: "unavailable",
        status: "draft",
      });
      expect(view.sort).toBe("created_desc");
    },
  );
});

describe("branding dashboard cursor token", () => {
  it("preserves preview and metadata inside the server-filter cursor binding", () => {
    const token = encodeBrandingDashboardCursorToken({
      cursor: {
        assetType: null,
        createdAt: null,
        id: "asset-12",
        status: null,
        updatedAt: "2026-06-26T10:00:00.000Z",
      },
      serverFilters: {
        assetType: "logo",
        metadata: "available",
        preview: "unavailable",
        status: "active",
      },
      serverSort: "updated_desc",
    });

    expect(decodeBrandingDashboardCursorToken(token)).toEqual({
      cursor: {
        assetType: null,
        createdAt: null,
        id: "asset-12",
        status: null,
        updatedAt: "2026-06-26T10:00:00.000Z",
      },
      serverFilters: {
        assetType: "logo",
        metadata: "available",
        preview: "unavailable",
        status: "active",
      },
      serverSort: "updated_desc",
    });
  });

  it("accepts legacy tokens without preview and metadata and normalizes them to all", () => {
    const legacyToken = Buffer.from(
      JSON.stringify({
        cursor: {
          assetType: null,
          createdAt: null,
          id: "asset-legacy",
          status: null,
          updatedAt: "2026-06-26T10:00:00.000Z",
        },
        serverFilters: {
          assetType: "logo",
          status: "active",
        },
        serverSort: "updated_desc",
      }),
      "utf8",
    ).toString("base64url");

    expect(decodeBrandingDashboardCursorToken(legacyToken)).toEqual({
      cursor: {
        assetType: null,
        createdAt: null,
        id: "asset-legacy",
        status: null,
        updatedAt: "2026-06-26T10:00:00.000Z",
      },
      serverFilters: {
        assetType: "logo",
        metadata: "all",
        preview: "all",
        status: "active",
      },
      serverSort: "updated_desc",
    });
  });

  it("rejects invalid preview or metadata values in cursor tokens", () => {
    const invalidToken = Buffer.from(
      JSON.stringify({
        cursor: {
          assetType: null,
          createdAt: null,
          id: "asset-invalid",
          status: null,
          updatedAt: "2026-06-26T10:00:00.000Z",
        },
        serverFilters: {
          assetType: null,
          metadata: "broken",
          preview: "maybe",
          status: null,
        },
        serverSort: "updated_desc",
      }),
      "utf8",
    ).toString("base64url");

    expect(decodeBrandingDashboardCursorToken(invalidToken)).toEqual({
      cursor: null,
      serverFilters: null,
      serverSort: null,
    });
  });
});
