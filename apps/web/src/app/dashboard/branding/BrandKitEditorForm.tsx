"use client";

import React, { useEffect, useState } from "react";
import type { BrandAssetRow, BrandKitDraftDefaults } from "./brand-kit";
import {
  brandAssetStatusLabels,
  brandAssetStatusOptions,
  brandAssetTypeLabels,
  brandAssetTypeOptions,
  serializeBrandKitConfig,
} from "./brand-kit";
import { BrandKitLivePreviewPanel } from "./BrandKitLivePreviewPanel";
import { BrandKitConfigTokenChips } from "./brand-kit-config-tokens";

type BrandKitEditorFormProps = {
  action: (formData: FormData) => Promise<void>;
  asset?: BrandAssetRow | null;
  defaults?: BrandKitDraftDefaults | null;
  description: string;
  deleteAction?: (formData: FormData) => Promise<void>;
  selectedTemplateDescription?: string | null;
  selectedTemplateLabel?: string | null;
  submitLabel: string;
  title: string;
};

export function BrandKitEditorForm({
  action,
  asset,
  defaults,
  description,
  deleteAction,
  selectedTemplateDescription,
  selectedTemplateLabel,
  submitLabel,
  title,
}: BrandKitEditorFormProps) {
  const defaultAssetType =
    asset?.asset_type ?? defaults?.assetType ?? "overlay";
  const defaultName = asset?.name ?? defaults?.name ?? "";
  const defaultStatus = asset?.status ?? defaults?.status ?? "draft";
  const defaultConfigJson = serializeBrandKitConfig(
    asset?.config ?? defaults?.config ?? {},
  );
  const [assetType, setAssetType] = useState(defaultAssetType);
  const [configJson, setConfigJson] = useState(defaultConfigJson);
  const [name, setName] = useState(defaultName);
  const [status, setStatus] = useState(defaultStatus);

  useEffect(() => {
    setAssetType(defaultAssetType);
    setConfigJson(defaultConfigJson);
    setName(defaultName);
    setStatus(defaultStatus);
  }, [defaultAssetType, defaultConfigJson, defaultName, defaultStatus]);

  return (
    <form action={action} className="space-y-4">
      {asset && <input name="brandAssetId" type="hidden" value={asset.id} />}

      <div className="space-y-1">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <p className="text-sm text-slate-400">{description}</p>
        {selectedTemplateLabel && (
          <p className="rounded-lg border border-signal-green/20 bg-signal-green/10 px-3 py-2 text-xs text-signal-green">
            Vorlage aktiv: {selectedTemplateLabel}
            {selectedTemplateDescription
              ? ` - ${selectedTemplateDescription}`
              : ""}
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="grid gap-2 text-sm font-semibold text-slate-300 sm:col-span-2">
          Name
          <input
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white outline-none transition placeholder:text-slate-500 focus:border-signal-green"
            name="name"
            maxLength={160}
            placeholder="Nova Tactical"
            required
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>

        <label className="grid gap-2 text-sm font-semibold text-slate-300">
          Status
          <select
            className="rounded-lg border border-white/10 bg-surface-900 px-3 py-2 text-white outline-none transition focus:border-signal-green"
            name="status"
            value={status}
            onChange={(event) => setStatus(event.target.value as typeof status)}
          >
            {brandAssetStatusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {brandAssetStatusLabels[option.value]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-semibold text-slate-300">
          Asset Type
          <select
            className="rounded-lg border border-white/10 bg-surface-900 px-3 py-2 text-white outline-none transition focus:border-signal-green"
            name="assetType"
            value={assetType}
            onChange={(event) =>
              setAssetType(event.target.value as typeof assetType)
            }
          >
            {brandAssetTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {brandAssetTypeLabels[option.value]}
              </option>
            ))}
          </select>
        </label>

        <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-slate-400">
          <p className="font-semibold text-slate-200">Config Hinweis</p>
          <p className="mt-1">
            `configJson` muss ein JSON-Objekt sein. Beispiel:{" "}
            <code>{'{"primaryColor":"#00d4aa"}'}</code>
          </p>
          <p className="mt-2 text-slate-500">
            Empfohlene Felder: primaryColor, secondaryColor, accentColor,
            surfaceColor, backgroundColor, textColor, safeArea, fontFamily,
            overlayOpacity.
          </p>
        </div>
      </div>

      <BrandKitConfigTokenChips value={configJson} onChange={setConfigJson} />

      <label className="grid gap-2 text-sm font-semibold text-slate-300">
        Config JSON
        <textarea
          className="min-h-40 rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-signal-green"
          name="configJson"
          placeholder='{"primaryColor":"#00d4aa","accentColor":"#9b5cff"}'
          value={configJson}
          onChange={(event) => setConfigJson(event.target.value)}
        />
      </label>

      <BrandKitLivePreviewPanel
        assetType={assetType}
        configJson={configJson}
        name={name}
        status={status}
      />

      <div className="flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-slate-400">
          <p>
            RLS bleibt aktiv, weil die Aktion die eingeloggte Supabase-Session
            nutzt.
          </p>
          <p className="mt-1">
            Aktueller Typ: {brandAssetTypeLabels[assetType]} | Status:{" "}
            {brandAssetStatusLabels[status]}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {deleteAction && asset && (
            <button
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-signal-red/30 bg-signal-red/10 px-4 py-2 text-sm font-semibold text-signal-red transition hover:bg-signal-red/15"
              formAction={deleteAction}
              type="submit"
            >
              Loeschen
            </button>
          )}
          <button className="btn-primary" type="submit">
            {submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}
