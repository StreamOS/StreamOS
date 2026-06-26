import React from "react";
import { uploadBrandAssetAction } from "./actions";
import {
  BrandingDashboardConsole,
  type BrandingDashboardConsoleView,
} from "@/components/modules/BrandingDashboardConsole";
import {
  BRANDING_DASHBOARD_MAX_WINDOWS,
  BRANDING_DASHBOARD_METADATA_FILTERS,
  BRANDING_DASHBOARD_PREVIEW_FILTERS,
  BRANDING_DASHBOARD_SORT_OPTIONS,
  buildBrandingDashboardViewModel,
  decodeBrandingDashboardCursorToken,
  type BrandingDashboardMetadataFilter,
  type BrandingDashboardPreviewFilter,
  type BrandingDashboardSortOption,
} from "@/components/modules/BrandingDashboardConsole.utils";
import { getBrandingDashboardData } from "./data";

export const dynamic = "force-dynamic";

export default async function BrandingPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const parsedView = parseBrandingDashboardView(resolvedSearchParams);
  const model = await getBrandingDashboardData({
    cursor: parsedView.loadMoreCursor,
    cursorServerSort: parsedView.cursorServerSort,
    windowCount: parsedView.windowCount,
  });
  const uploadFeedback = resolveBrandingUploadFeedback(resolvedSearchParams);
  const view = buildBrandingDashboardViewModel(model, parsedView);

  return (
    <BrandingDashboardConsole
      model={model}
      view={view as BrandingDashboardConsoleView}
      uploadAction={uploadBrandAssetAction}
      uploadFeedback={uploadFeedback}
    />
  );
}

function parseBrandingDashboardView(
  searchParams?: Record<string, string | string[] | undefined>,
) {
  const cursorToken = readSingleSearchParam(searchParams?.cursor);
  const decodedCursor = decodeBrandingDashboardCursorToken(cursorToken);
  const windowCount = parseBrandingWindowCount(searchParams?.window);

  return {
    assetType: readSingleSearchParam(searchParams?.assetType),
    cursorServerSort: decodedCursor.serverSort,
    cursorToken: decodedCursor.cursor ? cursorToken : null,
    detailAssetId: readSingleSearchParam(searchParams?.asset),
    loadMoreCursor: decodedCursor.cursor,
    metadata: parseBrandingMetadataFilter(searchParams?.metadata),
    preview: parseBrandingPreviewFilter(searchParams?.preview),
    sort: parseBrandingSort(searchParams?.sort),
    status: readSingleSearchParam(searchParams?.statusFilter),
    windowCount: decodedCursor.cursor ? windowCount : 1,
  };
}

function resolveBrandingUploadFeedback(
  searchParams?: Record<string, string | string[] | undefined>,
): {
  message: string;
  tone: "error" | "success";
} | null {
  const status = readSingleSearchParam(searchParams?.status);

  if (status === "brand-asset-uploaded") {
    return {
      message:
        "Brand Asset wurde privat gespeichert. Die Preview bleibt kurzlebig und serverseitig signiert.",
      tone: "success",
    };
  }

  const error = readSingleSearchParam(searchParams?.error);

  switch (error) {
    case "supabase-not-configured":
      return {
        message:
          "Supabase ist lokal nicht vollstaendig konfiguriert. Uploads bleiben deaktiviert.",
        tone: "error",
      };
    case "brand-asset-file-required":
      return {
        message: "Waehle eine PNG-, JPG/JPEG- oder WEBP-Datei fuer den Upload.",
        tone: "error",
      };
    case "brand-asset-file-too-large":
      return {
        message: "Brand Assets duerfen in diesem MVP maximal 5 MB gross sein.",
        tone: "error",
      };
    case "brand-asset-file-type-missing":
      return {
        message:
          "Der Dateityp konnte nicht sicher erkannt werden. Lade die Datei erneut hoch.",
        tone: "error",
      };
    case "brand-asset-file-type-not-supported":
      return {
        message: "Nur PNG, JPG/JPEG und WEBP sind in diesem Slice erlaubt.",
        tone: "error",
      };
    case "brand-asset-svg-not-supported":
      return {
        message:
          "SVG bleibt ohne Sanitizing-Contract blockiert. Nutze PNG, JPG/JPEG oder WEBP.",
        tone: "error",
      };
    case "brand-asset-file-extension-mismatch":
      return {
        message:
          "Dateiendung und Content-Type passen nicht zusammen. StreamOS blockiert den Upload.",
        tone: "error",
      };
    case "brand-asset-file-extension-missing":
    case "invalid-brand-asset-form":
      return {
        message:
          "Upload-Formular oder Dateiname ist ungueltig. Pruefe Asset-Typ, Namen und Datei erneut.",
        tone: "error",
      };
    case "brand-asset-upload-failed":
      return {
        message:
          "Der private Storage-Upload ist fehlgeschlagen. Es wurden keine oeffentlichen Asset-URLs erzeugt.",
        tone: "error",
      };
    case "brand-asset-persist-failed":
      return {
        message:
          "Die Asset-Metadaten konnten nach dem Upload nicht gespeichert werden. StreamOS hat ein serverseitiges Best-Effort-Cleanup versucht.",
        tone: "error",
      };
    case "brand-asset-cleanup-failed":
      return {
        message:
          "Der Upload konnte nach einem Persistenzfehler nicht vollstaendig rueckabgewickelt werden. StreamOS hat keine privaten Storage-Details offengelegt.",
        tone: "error",
      };
    default:
      return null;
  }
}

function readSingleSearchParam(
  value: string | string[] | undefined,
): string | null {
  if (typeof value === "string") {
    return value;
  }

  return Array.isArray(value) ? (value[0] ?? null) : null;
}

function parseBrandingSort(
  value: string | string[] | undefined,
): BrandingDashboardSortOption {
  const candidate = readSingleSearchParam(value);

  return BRANDING_DASHBOARD_SORT_OPTIONS.includes(candidate as never)
    ? (candidate as BrandingDashboardSortOption)
    : "updated_desc";
}

function parseBrandingPreviewFilter(
  value: string | string[] | undefined,
): BrandingDashboardPreviewFilter {
  const candidate = readSingleSearchParam(value);

  return BRANDING_DASHBOARD_PREVIEW_FILTERS.includes(candidate as never)
    ? (candidate as BrandingDashboardPreviewFilter)
    : "all";
}

function parseBrandingMetadataFilter(
  value: string | string[] | undefined,
): BrandingDashboardMetadataFilter {
  const candidate = readSingleSearchParam(value);

  return BRANDING_DASHBOARD_METADATA_FILTERS.includes(candidate as never)
    ? (candidate as BrandingDashboardMetadataFilter)
    : "all";
}

function parseBrandingWindowCount(
  value: string | string[] | undefined,
): number {
  const candidate = readSingleSearchParam(value);
  const parsed = candidate ? Number.parseInt(candidate, 10) : 1;

  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    return 1;
  }

  return Math.min(parsed, BRANDING_DASHBOARD_MAX_WINDOWS);
}
