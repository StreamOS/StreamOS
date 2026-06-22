import React from "react";

import { BrandAssetUploadSubmitButton } from "./BrandAssetUploadSubmitButton";
import {
  brandAssetStatusLabels,
  brandAssetStatusValues,
  brandAssetTypeLabels,
  brandAssetTypeValues,
} from "./brand-kit";

type BrandAssetUploadFormProps = {
  action: (formData: FormData) => Promise<void>;
};

export function BrandAssetUploadForm({ action }: BrandAssetUploadFormProps) {
  return (
    <form action={action} className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-white">Brand Asset Upload</h3>
        <p className="mt-1 text-sm leading-6 text-slate-400">
          Lade private Brand-Dateien in den Bucket `brand-assets`. Die Vorschau
          nutzt kurzlebige Signed URLs; es werden keine Public URLs gespeichert.
        </p>
      </div>

      <label className="grid gap-2 text-sm font-semibold text-slate-300">
        Datei
        <input
          accept="image/png,image/jpeg,image/webp"
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 file:mr-4 file:rounded-md file:border-0 file:bg-signal-green/15 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-signal-green"
          name="assetFile"
          required
          type="file"
        />
      </label>

      <div className="rounded-lg border border-signal-blue/20 bg-signal-blue/10 p-3 text-xs leading-5 text-slate-300">
        <p className="font-semibold text-slate-100">
          Erlaubte Formate: PNG, JPEG, WebP
        </p>
        <p className="mt-1">
          Maximale Groesse: 5 MB. Clientseitige Pruefung ist nur UX; die
          serverseitige Upload-Runtime bleibt massgeblich.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_160px]">
        <label className="grid gap-2 text-sm font-semibold text-slate-300">
          Name optional
          <input
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white outline-none transition placeholder:text-slate-500 focus:border-signal-green"
            maxLength={160}
            name="name"
            placeholder="Neon Logo"
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
            defaultValue="logo"
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
            maxLength={1000}
            name="description"
            placeholder="Kurzbeschreibung fuer den Brand-Kontext"
            type="text"
          />
        </label>
      </div>

      <BrandAssetUploadSubmitButton />
    </form>
  );
}
