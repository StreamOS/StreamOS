import React from "react";
import Image from "next/image";
import type { Json } from "@streamos/database";
import type { BrandAssetRow } from "./brand-kit";
import {
  brandAssetStatusLabels,
  brandAssetTypeLabels,
  summarizeBrandKitConfig,
} from "./brand-kit";

type BrandKitPreviewProps = {
  asset: BrandAssetRow;
};

export function BrandKitPreview({ asset }: BrandKitPreviewProps) {
  const tokens = resolvePreviewTokens(asset.config);

  return (
    <section
      className="overflow-hidden rounded-2xl border border-white/10 p-5"
      style={{
        background: `linear-gradient(135deg, ${tokens.primaryColor}, ${tokens.secondaryColor})`,
      }}
    >
      <div className="rounded-xl border border-white/15 bg-surface-950/65 p-4">
        {asset.previewUrl ? (
          // Signed URLs are short-lived and generated server-side for this user.
          <Image
            alt={`${asset.name} preview`}
            className="mb-4 max-h-40 w-full rounded-lg border border-white/10 object-contain"
            height={320}
            unoptimized
            src={asset.previewUrl}
            width={480}
          />
        ) : null}
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em]">
          <span className="rounded-full bg-white/10 px-3 py-1 text-white">
            {brandAssetTypeLabels[asset.asset_type]}
          </span>
          <span className="rounded-full bg-white/10 px-3 py-1 text-slate-200">
            {brandAssetStatusLabels[asset.status]}
          </span>
        </div>
        <h3
          className="mt-5 text-2xl font-semibold"
          style={{ color: tokens.textColor }}
        >
          {asset.name}
        </h3>
        <p className="mt-2 text-sm text-slate-300">
          {asset.description || summarizeBrandKitConfig(asset.config)}
        </p>
        {asset.previewStatus !== "available" ? (
          <p className="mt-4 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
            Private Datei-Vorschau aktuell nicht verfuegbar. Es werden keine
            Public URLs gespeichert.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function resolvePreviewTokens(config: Json) {
  const record = isRecord(config) ? config : {};

  return {
    primaryColor: readSafeColor(record.primaryColor, "#9b5cff"),
    secondaryColor: readSafeColor(record.secondaryColor, "#00d4aa"),
    textColor: readSafeColor(record.textColor, "#ffffff"),
  };
}

function readSafeColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();

  return /^#(?:[a-f0-9]{3}|[a-f0-9]{6}|[a-f0-9]{8})$/i.test(trimmed)
    ? trimmed
    : fallback;
}

function isRecord(value: Json): value is Record<string, Json> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
