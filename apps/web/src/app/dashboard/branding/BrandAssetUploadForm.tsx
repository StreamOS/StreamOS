"use client";

import React, { useState } from "react";
import {
  brandAssetStatusLabels,
  brandAssetStatusOptions,
  brandAssetTypeLabels,
} from "./brand-kit";
import { BrandKitConfigTokenChips } from "./brand-kit-config-tokens";
import {
  brandAssetUploadAccept,
  brandAssetUploadTypeLabels,
  brandAssetUploadTypeValues,
} from "./brand-asset-upload";

type BrandAssetUploadFormProps = {
  action: (formData: FormData) => Promise<void>;
};

export function BrandAssetUploadForm({ action }: BrandAssetUploadFormProps) {
  const [configJson, setConfigJson] = useState("");

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold text-white">
          Datei als Brand Asset hochladen
        </h3>
        <p className="text-sm text-slate-400">
          Fuer Logos, Banner und Overlay-Grafiken. Die Datei wird in Supabase
          Storage gespeichert und der Brand Asset Datensatz bleibt
          RLS-geschuetzt in `brand_assets`.
        </p>
      </div>

      <label className="grid gap-2 text-sm font-semibold text-slate-300">
        Asset Type
        <select
          className="rounded-lg border border-white/10 bg-surface-900 px-3 py-2 text-white outline-none transition focus:border-signal-green"
          defaultValue="overlay"
          name="assetType"
        >
          {brandAssetUploadTypeValues.map((value) => (
            <option key={value} value={value}>
              {brandAssetUploadTypeLabels[value]} ({brandAssetTypeLabels[value]}
              )
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-2 text-sm font-semibold text-slate-300">
        Datei
        <input
          accept={brandAssetUploadAccept}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none transition file:mr-4 file:rounded-lg file:border-0 file:bg-brand-500 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-brand-700 focus:border-signal-green"
          name="file"
          required
          type="file"
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-semibold text-slate-300">
          Name
          <input
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white outline-none transition placeholder:text-slate-500 focus:border-signal-green"
            maxLength={160}
            name="name"
            placeholder="Main Overlay File"
            required
            type="text"
          />
        </label>

        <label className="grid gap-2 text-sm font-semibold text-slate-300">
          Status
          <select
            className="rounded-lg border border-white/10 bg-surface-900 px-3 py-2 text-white outline-none transition focus:border-signal-green"
            defaultValue="draft"
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

      <label className="grid gap-2 text-sm font-semibold text-slate-300">
        Config JSON optional
        <textarea
          className="min-h-28 rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-signal-green"
          value={configJson}
          name="configJson"
          placeholder='{"placement":"top-right","safeArea":"16px"}'
          onChange={(event) => setConfigJson(event.target.value)}
        />
      </label>

      <BrandKitConfigTokenChips value={configJson} onChange={setConfigJson} />

      <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-slate-400">
        <p className="font-semibold text-slate-200">Upload Regeln</p>
        <ul className="mt-2 grid gap-1">
          <li>Maximale Dateigroesse: 10 MB</li>
          <li>Unterstuetzt: PNG, JPG, WebP, GIF, SVG, AVIF</li>
          <li>Storage-Pfad folgt `user_id/asset_type/upload_id/file`</li>
        </ul>
      </div>

      <button className="btn-primary w-full" type="submit">
        Datei hochladen
      </button>
    </form>
  );
}
