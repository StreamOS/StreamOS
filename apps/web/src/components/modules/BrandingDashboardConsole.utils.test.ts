import { describe, expect, it } from "vitest";
import {
  buildBrandingDashboardViewModel,
  createEmptyBrandingDashboardModel,
  type BrandingDashboardState,
} from "./BrandingDashboardConsole.utils";

describe("buildBrandingDashboardViewModel", () => {
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
        metadata: "client_window",
        preview: "client_window",
        status: "server_query",
      });
      expect(view.feed.clientFilters).toEqual({
        metadata: "invalid",
        preview: "unavailable",
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
