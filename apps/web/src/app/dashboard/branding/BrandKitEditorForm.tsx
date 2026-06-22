import React from "react";
import type { BrandAssetRow } from "./brand-kit";
import {
  brandAssetStatusLabels,
  brandAssetStatusValues,
  brandAssetTypeLabels,
  brandAssetTypeValues,
  serializeBrandKitConfig,
} from "./brand-kit";

type BrandKitEditorFormProps = {
  action: (formData: FormData) => Promise<void>;
  asset?: BrandAssetRow | null;
  description: string;
  submitLabel: string;
  title: string;
};

export function BrandKitEditorForm({
  action,
  asset = null,
  description,
  submitLabel,
  title,
}: BrandKitEditorFormProps) {
  return (
    <form action={action} className="space-y-4">
      {asset && <input name="brandAssetId" type="hidden" value={asset.id} />}

      <div>
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-slate-400">{description}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_160px]">
        <label className="grid gap-2 text-sm font-semibold text-slate-300">
          Name
          <input
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white outline-none transition placeholder:text-slate-500 focus:border-signal-green"
            defaultValue={asset?.name ?? ""}
            maxLength={160}
            name="name"
            placeholder="Neon Overlay"
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
            {brandAssetStatusValues.map((status) => (
              <option key={status} value={status}>
                {brandAssetStatusLabels[status]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-[220px_minmax(0,1fr)]">
        <label className="grid gap-2 text-sm font-semibold text-slate-300">
          Asset-Typ
          <select
            className="rounded-lg border border-white/10 bg-surface-900 px-3 py-2 text-white outline-none transition focus:border-signal-green"
            defaultValue={asset?.asset_type ?? "overlay"}
            name="assetType"
          >
            {brandAssetTypeValues.map((type) => (
              <option key={type} value={type}>
                {brandAssetTypeLabels[type]}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2 text-sm font-semibold text-slate-300">
          Beschreibung optional
          <input
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white outline-none transition placeholder:text-slate-500 focus:border-signal-green"
            defaultValue={asset?.description ?? ""}
            maxLength={1000}
            name="description"
            placeholder="Kurzbeschreibung fuer den Brand-Kontext"
            type="text"
          />
        </label>
      </div>

      <label className="grid gap-2 text-sm font-semibold text-slate-300">
        Config JSON
        <textarea
          className="min-h-36 rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-signal-green"
          defaultValue={serializeBrandKitConfig(asset?.config ?? {})}
          name="configJson"
          placeholder='{"primaryColor":"#00d4aa","safeArea":"16px"}'
        />
      </label>

      <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-xs leading-5 text-slate-400">
        <p className="font-semibold text-slate-200">Scope dieses MVP</p>
        <p className="mt-1">
          Speichert nur Metadaten und Config in `brand_assets`. Kein Upload,
          kein Storage-Bucket, keine Public-URL.
        </p>
      </div>

      <button className="btn-primary w-full sm:w-auto" type="submit">
        {submitLabel}
      </button>
    </form>
  );
}
