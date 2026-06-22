import type {
  BrandAssetStatus,
  BrandAssetType,
  Json,
  Tables,
} from "@streamos/database";
import { z } from "zod";

export const brandAssetTypeValues = [
  "overlay",
  "alert",
  "logo",
  "banner",
  "panel",
  "emote",
  "color_palette",
  "typography",
  "scene",
] as const satisfies readonly BrandAssetType[];

export const brandAssetStatusValues = [
  "draft",
  "active",
  "archived",
] as const satisfies readonly BrandAssetStatus[];

export const brandAssetTypeLabels: Record<BrandAssetType, string> = {
  alert: "Alert",
  banner: "Banner",
  color_palette: "Color Palette",
  emote: "Emote",
  logo: "Logo",
  overlay: "Overlay",
  panel: "Panel",
  scene: "Scene",
  typography: "Typography",
};

export const brandAssetStatusLabels: Record<BrandAssetStatus, string> = {
  active: "Aktiv",
  archived: "Archiviert",
  draft: "Entwurf",
};

export type BrandAssetRow = Pick<
  Tables<"brand_assets">,
  | "asset_type"
  | "config"
  | "created_at"
  | "description"
  | "id"
  | "metadata"
  | "name"
  | "status"
  | "updated_at"
>;

export type BrandKitFormValues = {
  assetType: BrandAssetType;
  config: Record<string, Json>;
  description: string | null;
  id: string | null;
  name: string;
  status: BrandAssetStatus;
};

export type BrandKitFormParseResult =
  | {
      ok: true;
      values: BrandKitFormValues;
    }
  | {
      error: "invalid-brand-kit-config" | "invalid-brand-kit-form";
      ok: false;
    };

const brandKitFormSchema = z.object({
  assetType: z.enum(brandAssetTypeValues),
  description: z.string().trim().max(1000).optional(),
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(160),
  status: z.enum(brandAssetStatusValues),
});

export function parseBrandKitFormData(
  formData: FormData,
): BrandKitFormParseResult {
  const parsedValues = brandKitFormSchema.safeParse({
    assetType: String(formData.get("assetType") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
    id: String(formData.get("brandAssetId") ?? "").trim() || undefined,
    name: String(formData.get("name") ?? "").trim(),
    status: String(formData.get("status") ?? "").trim(),
  });

  if (!parsedValues.success) {
    return {
      error: "invalid-brand-kit-form",
      ok: false,
    };
  }

  const parsedConfig = parseBrandKitConfig(
    String(formData.get("configJson") ?? "").trim(),
  );

  if (!parsedConfig.ok) {
    return parsedConfig;
  }

  return {
    ok: true,
    values: {
      assetType: parsedValues.data.assetType,
      config: parsedConfig.values,
      description: parsedValues.data.description || null,
      id: parsedValues.data.id ?? null,
      name: parsedValues.data.name,
      status: parsedValues.data.status,
    },
  };
}

export function parseBrandKitAssetId(
  formData: FormData,
): { error: "invalid-brand-kit-form"; ok: false } | { id: string; ok: true } {
  const id = String(formData.get("brandAssetId") ?? "").trim();

  if (!z.string().uuid().safeParse(id).success) {
    return {
      error: "invalid-brand-kit-form",
      ok: false,
    };
  }

  return {
    id,
    ok: true,
  };
}

export function serializeBrandKitConfig(config: Json): string {
  if (!isPlainObject(config)) {
    return "{}";
  }

  return JSON.stringify(config, null, 2);
}

export function summarizeBrandKitConfig(config: Json): string {
  if (!isPlainObject(config)) {
    return "Keine Config gesetzt";
  }

  const entries = Object.entries(config) as Array<[string, Json]>;

  if (entries.length === 0) {
    return "Keine Config gesetzt";
  }

  const preview = entries.slice(0, 3).map(([key, value]) => {
    return `${key}: ${summarizeJsonValue(value)}`;
  });

  if (entries.length > 3) {
    preview.push("...");
  }

  return preview.join(" | ");
}

function parseBrandKitConfig(configJson: string):
  | { error: "invalid-brand-kit-config"; ok: false }
  | {
      ok: true;
      values: Record<string, Json>;
    } {
  if (!configJson) {
    return {
      ok: true,
      values: {},
    };
  }

  try {
    const parsed = JSON.parse(configJson) as unknown;

    if (!isPlainObject(parsed)) {
      return {
        error: "invalid-brand-kit-config",
        ok: false,
      };
    }

    return {
      ok: true,
      values: parsed as Record<string, Json>,
    };
  } catch {
    return {
      error: "invalid-brand-kit-config",
      ok: false,
    };
  }
}

function summarizeJsonValue(value: Json): string {
  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return `[${value.length} items]`;
  }

  switch (typeof value) {
    case "boolean":
    case "number":
      return String(value);
    case "object":
      return "{...}";
    case "string":
      return value.length > 28 ? `${value.slice(0, 28)}...` : value;
    default:
      return "";
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
