import React from "react";
import { uploadBrandAssetAction } from "./actions";
import { BrandingDashboardConsole } from "@/components/modules/BrandingDashboardConsole";
import { getBrandingDashboardData } from "./data";

export const dynamic = "force-dynamic";

export default async function BrandingPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const model = await getBrandingDashboardData();
  const uploadFeedback = resolveBrandingUploadFeedback(resolvedSearchParams);

  return (
    <BrandingDashboardConsole
      model={model}
      uploadAction={uploadBrandAssetAction}
      uploadFeedback={uploadFeedback}
    />
  );
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
