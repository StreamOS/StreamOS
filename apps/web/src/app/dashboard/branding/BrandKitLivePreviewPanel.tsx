"use client";

import React, { useDeferredValue } from "react";
import type {
  BrandAssetStatus,
  BrandAssetType,
  Json,
} from "@streamos/database";
import { brandAssetStatusLabels, brandAssetTypeLabels } from "./brand-kit";

type BrandKitLivePreviewPanelProps = {
  assetType: BrandAssetType;
  configJson: string;
  name: string;
  status: BrandAssetStatus;
};

export function BrandKitLivePreviewPanel({
  assetType,
  configJson,
  name,
  status,
}: BrandKitLivePreviewPanelProps) {
  const deferredConfigJson = useDeferredValue(configJson);
  const parsed = parsePreviewConfig(deferredConfigJson);
  const previewName = name.trim() || "Unbenanntes Brand Kit";
  const previewTypeLabel = brandAssetTypeLabels[assetType];
  const previewStatusLabel = brandAssetStatusLabels[status];
  const tokens = getPreviewTokens(parsed.values);
  const layoutPreset = getLayoutPreset(assetType);
  const configEntries = Object.entries(parsed.values).slice(0, 4);

  return (
    <section className="rounded-2xl border border-white/10 bg-surface-950/80 p-4 shadow-[0_18px_60px_rgba(2,6,23,0.35)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-signal-green">
            Live Preview
          </p>
          <h4 className="mt-1 text-sm font-semibold text-white">
            Konfigurationsvorschau
          </h4>
        </div>
        <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-300">
          {previewTypeLabel} | {previewStatusLabel}
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.85fr)]">
        <div
          className="relative overflow-hidden rounded-2xl border border-white/10 p-4"
          style={{
            backgroundImage: `linear-gradient(135deg, ${tokens.primaryColor} 0%, ${tokens.secondaryColor} 48%, ${tokens.surfaceColor} 100%)`,
          }}
        >
          <div
            className="absolute inset-x-6 top-6 h-24 rounded-full blur-3xl"
            style={{
              backgroundColor: tokens.accentColor,
              opacity: tokens.overlayOpacity,
            }}
          />

          <div className="relative flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.12em] text-white/80">
            <span>{previewTypeLabel}</span>
            <span>{previewStatusLabel}</span>
          </div>

          <div className="relative mt-3 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200">
            <div>
              <p className="font-semibold text-white">Layout Preset</p>
              <p className="text-slate-400">
                {layoutPreset.label} - {layoutPreset.description}
              </p>
            </div>
            <span className="rounded-full border border-white/10 bg-surface-950/65 px-2.5 py-1 font-semibold text-white">
              {layoutPreset.key}
            </span>
          </div>

          <div className="relative mt-4">
            {assetType === "banner" ? (
              <BannerLayoutPreview
                fontFamily={tokens.fontFamily}
                name={previewName}
                overlayOpacity={tokens.overlayOpacity}
                primaryColor={tokens.primaryColor}
                secondaryColor={tokens.secondaryColor}
                statusLabel={previewStatusLabel}
                safeArea={tokens.safeArea}
              />
            ) : assetType === "logo" ? (
              <LogoLayoutPreview
                accentColor={tokens.accentColor}
                fontFamily={tokens.fontFamily}
                name={previewName}
                primaryColor={tokens.primaryColor}
                secondaryColor={tokens.secondaryColor}
                statusLabel={previewStatusLabel}
                safeArea={tokens.safeArea}
                textColor={tokens.textColor}
              />
            ) : (
              <OverlayLayoutPreview
                accentColor={tokens.accentColor}
                fontFamily={tokens.fontFamily}
                name={previewName}
                overlayOpacity={tokens.overlayOpacity}
                primaryColor={tokens.primaryColor}
                secondaryColor={tokens.secondaryColor}
                statusLabel={previewStatusLabel}
                safeArea={tokens.safeArea}
                surfaceColor={tokens.surfaceColor}
                textColor={tokens.textColor}
              />
            )}
          </div>

          <p className="relative mt-3 text-xs text-slate-300">
            Farbe, Status und Name spiegeln den aktuellen Formzustand live
            wider.
          </p>
        </div>

        <div className="space-y-3">
          <section className="rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-signal-green">
              Token-Felder
            </p>
            {parsed.error ? (
              <p className="mt-2 text-sm text-signal-red">{parsed.error}</p>
            ) : configEntries.length > 0 ? (
              <ul className="mt-3 space-y-2 text-sm text-slate-300">
                {configEntries.map(([key, value]) => (
                  <li
                    className="flex items-start justify-between gap-3 rounded-lg border border-white/10 bg-surface-900/60 px-3 py-2"
                    key={key}
                  >
                    <span className="font-semibold text-white">{key}</span>
                    <span className="text-right text-xs text-slate-400">
                      {formatPreviewValue(value)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-slate-400">
                Noch keine Config gesetzt. Fuege JSON hinzu, um Farben und
                Layout-Details zu sehen.
              </p>
            )}
          </section>

          <section className="rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-signal-green">
              Empfohlene Tokens
            </p>
            <div className="mt-3 grid gap-2">
              {[
                ["primaryColor", "Primary", tokens.primaryColor],
                ["secondaryColor", "Secondary", tokens.secondaryColor],
                ["accentColor", "Accent", tokens.accentColor],
                ["surfaceColor", "Surface", tokens.surfaceColor],
                ["backgroundColor", "Background", tokens.backgroundColor],
                ["textColor", "Text", tokens.textColor],
                ["safeArea", "Safe Area", tokens.safeArea],
                ["fontFamily", "Font Family", tokens.fontFamily],
                ["overlayOpacity", "Overlay Opacity", tokens.overlayOpacity],
              ].map(([slug, label, value]) => (
                <div
                  className="flex items-center gap-3 rounded-lg border border-white/10 bg-surface-900/70 px-3 py-2"
                  key={slug}
                >
                  <span
                    className="h-8 w-8 rounded-lg border border-white/10"
                    style={{
                      backgroundColor:
                        typeof value === "string" && isProbablyCssColor(value)
                          ? value
                          : tokens.accentColor,
                    }}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">{label}</p>
                    <p className="truncate text-xs text-slate-400">
                      {value as string}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}

type PreviewConfigParseResult =
  | { error: string; values: Record<string, Json> }
  | { error: null; values: Record<string, Json> };

type PreviewTokens = {
  accentColor: string;
  backgroundColor: string;
  fontFamily: string;
  overlayOpacity: number;
  primaryColor: string;
  safeArea: string;
  secondaryColor: string;
  surfaceColor: string;
  textColor: string;
};

type LayoutPreset = {
  description: string;
  key: "banner" | "logo" | "overlay";
  label: string;
};

function parsePreviewConfig(configJson: string): PreviewConfigParseResult {
  if (!configJson.trim()) {
    return {
      error: null,
      values: {},
    };
  }

  try {
    const parsed = JSON.parse(configJson) as unknown;

    if (!isPlainObject(parsed)) {
      return {
        error: "Config muss ein JSON-Objekt sein.",
        values: {},
      };
    }

    return {
      error: null,
      values: parsed as Record<string, Json>,
    };
  } catch {
    return {
      error: "Config JSON ist ungueltig.",
      values: {},
    };
  }
}

function getLayoutPreset(assetType: BrandAssetType): LayoutPreset {
  switch (assetType) {
    case "banner":
      return {
        description: "Wide header layout for channels, panels, and promos.",
        key: "banner",
        label: "Banner Layout",
      };
    case "logo":
      return {
        description: "Compact centered mark for avatars and identity blocks.",
        key: "logo",
        label: "Logo Layout",
      };
    default:
      return {
        description: "Layered scene treatment for overlays and stream HUDs.",
        key: "overlay",
        label: "Overlay Layout",
      };
  }
}

function getPreviewTokens(config: Record<string, Json>): PreviewTokens {
  const defaults = {
    accent: "#00d4aa",
    background: "#0b1120",
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI"',
    overlayOpacity: 0.35,
    primary: "#0f172a",
    secondary: "#1d4ed8",
    safeArea: "16px",
    surface: "#111827",
    text: "#f8fafc",
  };

  return {
    accentColor: getCssColor(config.accentColor) ?? defaults.accent,
    backgroundColor: getCssColor(config.backgroundColor) ?? defaults.background,
    fontFamily: getPreviewFontFamily(config.fontFamily) ?? defaults.fontFamily,
    overlayOpacity:
      getPreviewOpacity(config.overlayOpacity) ?? defaults.overlayOpacity,
    primaryColor: getCssColor(config.primaryColor) ?? defaults.primary,
    safeArea: getPreviewSafeArea(config.safeArea) ?? defaults.safeArea,
    secondaryColor: getCssColor(config.secondaryColor) ?? defaults.secondary,
    surfaceColor: getCssColor(config.surfaceColor) ?? defaults.surface,
    textColor: getCssColor(config.textColor) ?? defaults.text,
  };
}

function BannerLayoutPreview({
  fontFamily,
  name,
  overlayOpacity,
  primaryColor,
  secondaryColor,
  statusLabel,
  safeArea,
}: {
  fontFamily: string;
  name: string;
  overlayOpacity: number;
  primaryColor: string;
  secondaryColor: string;
  statusLabel: string;
  safeArea: string;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-white/10 p-4"
      style={{
        backgroundImage: `linear-gradient(90deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
        minHeight: "176px",
      }}
    >
      <div
        className="absolute inset-y-4 right-4 w-28 rounded-3xl blur-3xl"
        style={{ backgroundColor: secondaryColor, opacity: overlayOpacity }}
      />
      <SafeAreaFrame safeArea={safeArea} />
      <div className="relative flex h-full items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/75">
            Banner Preset
          </p>
          <h5
            className="mt-2 text-2xl font-semibold leading-tight text-white"
            style={{ fontFamily }}
          >
            {name}
          </h5>
          <p className="mt-2 max-w-lg text-sm text-white/80">
            {statusLabel} - Breites Layout mit Platz fuer Titel, CTA und
            Branding-Spur.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/80">
            <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1">
              16:5 Header
            </span>
            <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1">
              Promo-ready
            </span>
          </div>
        </div>
        <div className="hidden h-24 w-24 rounded-2xl border border-white/15 bg-white/10 p-3 sm:block">
          <div
            className="h-full w-full rounded-xl border border-white/10"
            style={{
              backgroundImage: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
            }}
          />
        </div>
      </div>
    </div>
  );
}

function LogoLayoutPreview({
  accentColor,
  fontFamily,
  name,
  primaryColor,
  secondaryColor,
  statusLabel,
  safeArea,
  textColor,
}: {
  accentColor: string;
  fontFamily: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  statusLabel: string;
  safeArea: string;
  textColor: string;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-white/10 p-6"
      style={{
        backgroundImage: `radial-gradient(circle at top, ${secondaryColor} 0%, ${primaryColor} 44%, #020617 100%)`,
        minHeight: "280px",
      }}
    >
      <div
        className="absolute left-1/2 top-8 h-32 w-32 -translate-x-1/2 rounded-full blur-3xl"
        style={{ backgroundColor: accentColor, opacity: 0.3 }}
      />
      <SafeAreaFrame safeArea={safeArea} />
      <div className="relative flex h-full flex-col items-center justify-center text-center">
        <div
          className="flex h-28 w-28 items-center justify-center rounded-[2rem] border border-white/15 bg-white/10 shadow-2xl"
          style={{
            backgroundImage: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
          }}
        >
          <div
            className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/20 bg-surface-950/60 text-lg font-black text-white"
            style={{ fontFamily }}
          >
            {buildLogoGlyph(name)}
          </div>
        </div>
        <h5
          className="mt-5 text-2xl font-semibold text-white"
          style={{ fontFamily }}
        >
          {name}
        </h5>
        <p className="mt-2 max-w-xs text-sm text-white/80">
          {statusLabel} - Kompaktes Logo-Preset fuer Avatare, Panels und
          Branding-Kacheln.
        </p>
        <div className="mt-4 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/80">
          {textColor}
        </div>
      </div>
    </div>
  );
}

function OverlayLayoutPreview({
  accentColor,
  fontFamily,
  name,
  overlayOpacity,
  primaryColor,
  secondaryColor,
  statusLabel,
  safeArea,
  surfaceColor,
  textColor,
}: {
  accentColor: string;
  fontFamily: string;
  name: string;
  overlayOpacity: number;
  primaryColor: string;
  secondaryColor: string;
  statusLabel: string;
  safeArea: string;
  surfaceColor: string;
  textColor: string;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-white/10 p-4"
      style={{
        backgroundImage: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 48%, ${surfaceColor} 100%)`,
        minHeight: "280px",
      }}
    >
      <div
        className="absolute inset-x-6 top-6 h-24 rounded-full blur-3xl"
        style={{ backgroundColor: accentColor, opacity: overlayOpacity }}
      />
      <SafeAreaFrame safeArea={safeArea} />
      <div className="relative flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.12em] text-white/80">
        <span>Overlay Preset</span>
        <span>{statusLabel}</span>
      </div>
      <div className="relative mt-4 rounded-2xl border border-white/10 bg-surface-950/65 p-4 backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-slate-400">Name</p>
            <h5
              className="mt-1 text-lg font-semibold text-white"
              style={{ fontFamily }}
            >
              {name}
            </h5>
          </div>

          <div
            className="h-11 w-11 rounded-xl border border-white/15 shadow-lg"
            style={{
              backgroundImage: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
            }}
          />
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {[
            ["Accent", accentColor],
            ["Surface", surfaceColor],
            ["Text", textColor],
          ].map(([label, value]) => (
            <div
              className="rounded-xl border border-white/10 bg-white/5 p-2.5"
              key={label}
            >
              <div
                className="h-2.5 rounded-full"
                style={{ backgroundColor: value as string }}
              />
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                {label}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-xl border border-dashed border-white/10 bg-white/5 p-3">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <div className="space-y-2">
              <div className="h-2 w-24 rounded-full bg-white/15" />
              <div className="h-3 w-4/5 rounded-full bg-white/10" />
              <div className="h-3 w-3/5 rounded-full bg-white/10" />
            </div>
            <div
              className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white"
              style={{
                backgroundImage: `linear-gradient(135deg, ${primaryColor}, ${accentColor})`,
                opacity: overlayOpacity,
                fontFamily,
              }}
            >
              Overlay
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function buildLogoGlyph(name: string): string {
  const normalized = name.trim().replace(/([a-z])([A-Z])/g, "$1 $2");

  const value = normalized
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return value || "S";
}

function SafeAreaFrame({ safeArea }: { safeArea: string }) {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-20"
      aria-hidden="true"
      style={{ padding: safeArea }}
    >
      <div className="relative h-full w-full rounded-[1.5rem] border border-dashed border-white/25">
        <div className="absolute left-3 top-3 rounded-full border border-white/20 bg-surface-950/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/90 shadow-lg">
          Safe Area {safeArea}
        </div>
      </div>
    </div>
  );
}

function formatPreviewValue(value: Json): string {
  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return `[${value.length} items]`;
  }

  if (typeof value === "object") {
    return "{...}";
  }

  if (typeof value === "string") {
    return value.length > 32 ? `${value.slice(0, 32)}...` : value;
  }

  return String(value);
}

function getCssColor(value: Json | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (isProbablyCssColor(trimmed)) {
    return trimmed;
  }

  return null;
}

function getPreviewFontFamily(value: Json | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  return trimmed;
}

function getPreviewOpacity(value: Json | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return clamp(value, 0.05, 1);
  }

  if (typeof value === "string") {
    const normalized = Number(value);

    if (!Number.isNaN(normalized)) {
      return clamp(normalized, 0.05, 1);
    }
  }

  return null;
}

function getPreviewSafeArea(value: Json | undefined): string | null {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const stringValue = String(value).trim();

  if (!stringValue) {
    return null;
  }

  return stringValue;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isProbablyCssColor(value: string): boolean {
  return (
    /^#([0-9a-f]{3,8})$/i.test(value) ||
    /^rgb(a)?\(/i.test(value) ||
    /^hsl(a)?\(/i.test(value) ||
    /^oklch\(/i.test(value) ||
    /^var\(--[a-z0-9-]+\)$/i.test(value) ||
    /^[a-z]+$/i.test(value)
  );
}

function isPlainObject(value: unknown): value is Record<string, Json> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
