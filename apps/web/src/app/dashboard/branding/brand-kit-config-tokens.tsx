"use client";

import React from "react";
import type { Json } from "@streamos/database";

export type BrandKitConfigTokenChip = {
  description: string;
  key: string;
  label: string;
  value: Json;
};

export type BrandKitConfigTokenGroup = {
  description: string;
  key: "colors" | "layout" | "typography";
  label: string;
  tokens: BrandKitConfigTokenChip[];
};

export const brandKitConfigTokenGroups: BrandKitConfigTokenGroup[] = [
  {
    description: "Primary, secondary, and accent values for the color system.",
    key: "colors",
    label: "Colors",
    tokens: [
      {
        description: "Fast-changing primary color for brand accents.",
        key: "primaryColor",
        label: "Primary",
        value: "#00d4aa",
      },
      {
        description: "Adds depth and gradient support to the main color.",
        key: "secondaryColor",
        label: "Secondary",
        value: "#1d4ed8",
      },
      {
        description: "Signal tone for highlights, glows, and interactions.",
        key: "accentColor",
        label: "Accent",
        value: "#9b5cff",
      },
      {
        description: "Dark surface for panels, frames, and overlays.",
        key: "surfaceColor",
        label: "Surface",
        value: "#111827",
      },
      {
        description: "Background value for the base mood of the kit.",
        key: "backgroundColor",
        label: "Background",
        value: "#0b1120",
      },
      {
        description: "Text color for high contrast labels and copy.",
        key: "textColor",
        label: "Text",
        value: "#f8fafc",
      },
    ],
  },
  {
    description: "Spacing, inset, and container controls for layouts.",
    key: "layout",
    label: "Layout",
    tokens: [
      {
        description: "Safe inset for banners, overlays, and logos.",
        key: "safeArea",
        label: "Safe Area",
        value: "16px",
      },
      {
        description: "Dark surface used for framing and depth.",
        key: "surfaceColor",
        label: "Surface",
        value: "#111827",
      },
      {
        description: "Background value for the base mood of the kit.",
        key: "backgroundColor",
        label: "Background",
        value: "#0b1120",
      },
    ],
  },
  {
    description: "Typography and intensity controls for the brand system.",
    key: "typography",
    label: "Typography",
    tokens: [
      {
        description: "Default font for the visual system.",
        key: "fontFamily",
        label: "Font Family",
        value:
          'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI"',
      },
      {
        description: "Transparency for glow and overlay surfaces.",
        key: "overlayOpacity",
        label: "Overlay Opacity",
        value: 0.35,
      },
      {
        description: "Text color for high contrast labels and copy.",
        key: "textColor",
        label: "Text",
        value: "#f8fafc",
      },
    ],
  },
];

export const brandKitConfigTokenChips = brandKitConfigTokenGroups.flatMap(
  (group) => group.tokens,
);

type BrandKitConfigTokenChipsProps = {
  onChange: (value: string) => void;
  value: string;
};

export function BrandKitConfigTokenChips({
  onChange,
  value,
}: BrandKitConfigTokenChipsProps) {
  const currentConfig = parseConfigObject(value);

  return (
    <section className="rounded-lg border border-white/10 bg-white/5 p-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-signal-green">
            Token-Chips
          </p>
          <p className="mt-1 text-xs text-slate-400">
            One click writes the preset into the JSON and merges existing
            values.
          </p>
        </div>
        <p className="text-[11px] text-slate-500">
          Active chips are highlighted.
        </p>
      </div>

      <div className="mt-3 space-y-3">
        {brandKitConfigTokenGroups.map((group) => (
          <section
            className="rounded-lg border border-white/10 bg-surface-950/40 p-3"
            key={group.key}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-white">
                  {group.label}
                </h4>
                <p className="mt-1 text-xs text-slate-400">
                  {group.description}
                </p>
              </div>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-slate-300">
                {group.tokens.length}
              </span>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {group.tokens.map((chip) => {
                const isActive = Boolean(
                  currentConfig &&
                  Object.prototype.hasOwnProperty.call(currentConfig, chip.key),
                );

                return (
                  <button
                    className={`flex min-h-12 items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition ${
                      isActive
                        ? "border-signal-green/40 bg-signal-green/10"
                        : "border-white/10 bg-surface-900/70 hover:border-signal-green/30 hover:bg-white/10"
                    }`}
                    key={chip.key}
                    type="button"
                    aria-pressed={isActive}
                    title={chip.description}
                    onClick={() =>
                      onChange(applyBrandKitConfigToken(value, chip))
                    }
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-white">
                        {chip.label}
                      </span>
                      <span className="block truncate text-[11px] text-slate-400">
                        {chip.key}
                      </span>
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-semibold text-slate-300">
                      {formatChipValue(chip.value)}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

export function applyBrandKitConfigToken(
  configJson: string,
  token: BrandKitConfigTokenChip,
): string {
  const parsedConfig = parseConfigObject(configJson) ?? {};

  return JSON.stringify(
    {
      ...parsedConfig,
      [token.key]: token.value,
    },
    null,
    2,
  );
}

function parseConfigObject(configJson: string): Record<string, Json> | null {
  if (!configJson.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(configJson) as unknown;

    if (!isPlainObject(parsed)) {
      return null;
    }

    return parsed as Record<string, Json>;
  } catch {
    return null;
  }
}

function formatChipValue(value: Json): string {
  if (typeof value === "string") {
    return value.length > 18 ? `${value.slice(0, 18)}...` : value;
  }

  return String(value);
}

function isPlainObject(value: unknown): value is Record<string, Json> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
