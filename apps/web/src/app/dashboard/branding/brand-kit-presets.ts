import type { Json } from "@streamos/database";
import type { BrandAssetRow, BrandKitDraftDefaults } from "./brand-kit";

export type BrandKitTemplateSelection =
  | {
      description: string;
      defaults: BrandKitDraftDefaults;
      key: string;
      label: string;
      source: "preset";
    }
  | {
      description: string;
      defaults: BrandKitDraftDefaults;
      key: string;
      label: string;
      source: "brand-kit";
    };

export type BrandKitPresetTemplate = {
  description: string;
  defaults: BrandKitDraftDefaults;
  key: string;
  label: string;
};

export const brandKitPresetTemplates: BrandKitPresetTemplate[] = [
  {
    description: "High-contrast overlay for fast live reads.",
    defaults: {
      assetType: "overlay",
      config: {
        accentColor: "#00d4aa",
        backgroundColor: "#090a0f",
        borderRadius: "20px",
        primaryColor: "#9b5cff",
        shadow: "soft neon",
        typography: "Space Grotesk",
      },
      name: "Neon Tactical",
      status: "draft",
    },
    key: "neon-tactical",
    label: "Neon Tactical",
  },
  {
    description: "Warm, calm, and tuned for chat-heavy streams.",
    defaults: {
      assetType: "banner",
      config: {
        accentColor: "#f5c842",
        backgroundColor: "#18111b",
        decorativeStyle: "soft gradient",
        primaryColor: "#f8fafc",
        typography: "Fraunces",
        warmShadow: "amber haze",
      },
      name: "Cozy Stream",
      status: "draft",
    },
    key: "cozy-stream",
    label: "Cozy Stream",
  },
  {
    description: "Minimal identity system for a clean creator brand.",
    defaults: {
      assetType: "logo",
      config: {
        accentColor: "#0f172a",
        backgroundColor: "#f8fafc",
        iconStyle: "monogram",
        primaryColor: "#111827",
        typography: "Inter",
      },
      name: "Minimal Signal",
      status: "draft",
    },
    key: "minimal-signal",
    label: "Minimal Signal",
  },
  {
    description: "Alert-ready look for raids and community moments.",
    defaults: {
      assetType: "alert",
      config: {
        accentColor: "#ff4e6a",
        backgroundColor: "#111827",
        pulseEffect: "fast",
        primaryColor: "#f43f5e",
        typography: "Bebas Neue",
      },
      name: "Raid Pulse",
      status: "draft",
    },
    key: "raid-pulse",
    label: "Raid Pulse",
  },
];

export function getBrandKitPresetTemplate(
  key: string,
): BrandKitPresetTemplate | null {
  return (
    brandKitPresetTemplates.find((template) => template.key === key) ?? null
  );
}

export function resolveBrandKitTemplateSelection({
  assets,
  templateKey,
}: {
  assets: BrandAssetRow[];
  templateKey: string | null;
}): BrandKitTemplateSelection | null {
  if (!templateKey) {
    return null;
  }

  const preset = getBrandKitPresetTemplate(templateKey);

  if (preset) {
    return {
      ...preset,
      source: "preset",
    };
  }

  const asset = assets.find((item) => item.id === templateKey);

  if (!asset) {
    return null;
  }

  return {
    description: "Vorlage aus einem bestehenden Brand Kit.",
    defaults: {
      assetType: asset.asset_type,
      config: normalizeJsonObject(asset.config),
      name: `${asset.name} Copy`,
      status: "draft",
    },
    key: asset.id,
    label: asset.name,
    source: "brand-kit",
  };
}

function normalizeJsonObject(value: Json): Record<string, Json> {
  if (!isPlainObject(value)) {
    return {};
  }

  return value;
}

function isPlainObject(value: unknown): value is Record<string, Json> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
