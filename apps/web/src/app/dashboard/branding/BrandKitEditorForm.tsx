import React from "react";
import type { BrandAssetRow } from "./brand-kit";
import {
  brandAssetStatusLabels,
  brandAssetStatusOptions,
  brandAssetTypeLabels,
  brandAssetTypeOptions,
  serializeBrandKitConfig,
} from "./brand-kit";

type BrandKitEditorFormProps = {
  action: (formData: FormData) => Promise<void>;
  asset?: BrandAssetRow | null;
  description: string;
  deleteAction?: (formData: FormData) => Promise<void>;
  submitLabel: string;
  title: string;
};

export function BrandKitEditorForm({
  action,
  asset,
  description,
  deleteAction,
  submitLabel,
  title,
}: BrandKitEditorFormProps) {
  const configJson = serializeBrandKitConfig(asset?.config ?? {});

  return (
    <form action={action} className="space-y-4">
      {asset && <input name="brandAssetId" type="hidden" value={asset.id} />}

      <div className="space-y-1">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <p className="text-sm text-slate-400">{description}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="grid gap-2 text-sm font-semibold text-slate-300 sm:col-span-2">
          Name
          <input
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white outline-none transition placeholder:text-slate-500 focus:border-signal-green"
            defaultValue={asset?.name ?? ""}
            maxLength={160}
            name="name"
            placeholder="Nova Tactical"
            required
            type="text"
          />
        </label>

        <label className="grid gap-2 text-sm font-semibold text-slate-300">
          Status
          <select
            className="rounded-lg border border-white/10 bg-surface-900 px-3 py-2 text-white outline-none transition focus:border-signal-green"
            defaultValue={asset?.status ?? "draft"}
            name="status"
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
            defaultValue={asset?.asset_type ?? "overlay"}
            name="assetType"
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
        </div>
      </div>

      <label className="grid gap-2 text-sm font-semibold text-slate-300">
        Config JSON
        <textarea
          className="min-h-40 rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-signal-green"
          defaultValue={configJson}
          name="configJson"
          placeholder='{"primaryColor":"#00d4aa","accentColor":"#9b5cff"}'
        />
      </label>

      <div className="flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-slate-400">
          <p>
            RLS bleibt aktiv, weil die Aktion die eingeloggte Supabase-Session
            nutzt.
          </p>
          <p className="mt-1">
            Aktueller Typ:{" "}
            {brandAssetTypeLabels[asset?.asset_type ?? "overlay"]} | Status:{" "}
            {brandAssetStatusLabels[asset?.status ?? "draft"]}
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
