import React from "react";
import {
  ArchiveRestore,
  Layers3,
  Palette,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { StatCard } from "@streamos/ui";

import {
  createBrandKitAction,
  deleteBrandKitAction,
  uploadBrandAssetFileAction,
  updateBrandKitAction,
} from "./actions";
import { BrandAssetUploadForm } from "./BrandAssetUploadForm";
import { BrandKitEditorForm } from "./BrandKitEditorForm";
import { BrandKitPreview } from "./BrandKitPreview";
import {
  brandAssetStatusLabels,
  brandAssetTypeLabels,
  summarizeBrandKitConfig,
} from "./brand-kit";
import { getBrandKitDashboardData } from "./data";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getSupabaseSetupNotice } from "@/lib/supabase/messages";

type BrandingPageProps = {
  searchParams?: Promise<{
    error?: string;
    status?: string;
  }>;
};

export default async function BrandingPage({
  searchParams,
}: BrandingPageProps) {
  const params = await searchParams;
  const configured = isSupabaseConfigured();
  const dashboard = await getBrandKitDashboardData();

  return (
    <div className="space-y-6">
      <BrandingNotice
        dataError={dashboard.error}
        error={params?.error}
        status={params?.status}
      />

      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-signal-green">
            Branding Studio
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-white">
            Brand Kits, Overlays und visuelle Leitplanken
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
            Pflege Brand-Kit-Daten direkt in `brand_assets`. Private Dateien
            bleiben im Bucket `brand-assets`; Vorschauen nutzen kurzlebige
            Signed URLs ohne dauerhafte Public-URL-Persistenz.
          </p>
        </div>
        <div className="rounded-2xl border border-signal-green/20 bg-signal-green/10 px-4 py-3 text-sm text-signal-green">
          RLS-geschuetzte User-Session
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard
          icon={Layers3}
          label="Brand Kits"
          tone="emerald"
          trend="Gespeicherte Assets"
          value={String(dashboard.totalAssets)}
        />
        <StatCard
          icon={Sparkles}
          label="Aktiv"
          tone="violet"
          trend="Bereit fuer Layouts"
          value={String(dashboard.activeAssets)}
        />
        <StatCard
          icon={ArchiveRestore}
          label="Archiviert"
          tone="amber"
          trend={`${dashboard.draftAssets} Entwuerfe`}
          value={String(dashboard.archivedAssets)}
        />
      </section>

      {!configured ? (
        <section className="card space-y-3">
          <h2 className="text-lg font-semibold text-white">
            Supabase noch nicht konfiguriert
          </h2>
          <p className="text-sm leading-6 text-slate-400">
            {getSupabaseSetupNotice(
              "das Branding-Modul echte Brand Kits lesen und speichern kann",
            )}
          </p>
        </section>
      ) : (
        <section className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <aside className="space-y-6">
            <article className="card">
              <BrandKitEditorForm
                action={createBrandKitAction}
                description="Lege ein Brand Kit ohne Upload-UI an. Die Daten werden tenant-sicher ueber die angemeldete Supabase-Session gespeichert."
                submitLabel="Brand Kit erstellen"
                title="Neues Brand Kit"
              />
            </article>

            <article className="card">
              <BrandAssetUploadForm action={uploadBrandAssetFileAction} />
            </article>

            <article className="card">
              <div className="flex items-center gap-3">
                <span className="rounded-lg border border-signal-blue/20 bg-signal-blue/10 p-2 text-signal-blue">
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
                    Security Scope
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-white">
                    Private Assets ohne Public URLs
                  </h2>
                </div>
              </div>
              <ul className="mt-4 space-y-2 text-sm text-slate-300">
                <li>Private Dateien liegen im Bucket `brand-assets`.</li>
                <li>Kurzlebige Signed URLs werden nur serverseitig erzeugt.</li>
                <li>Keine Public-URLs und keine Client-Storage-API.</li>
                <li>Keine Service-Role im Web-Scope.</li>
                <li>Update/Delete nutzen `id` und `user_id` Filter.</li>
              </ul>
            </article>
          </aside>

          <section className="space-y-4">
            <div className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.08em] text-signal-green">
                  Brand Assets
                </p>
                <h2 className="mt-2 text-lg font-semibold text-white">
                  Gespeicherte Kits
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  {dashboard.assets.length > 0
                    ? `${dashboard.assets.length} Brand Kits nach letzter Aktualisierung sortiert.`
                    : "Noch keine Brand Kits angelegt."}
                </p>
              </div>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-300">
                User {dashboard.userId ?? "nicht angemeldet"}
              </span>
            </div>

            {dashboard.assets.length === 0 ? (
              <EmptyBrandKitState />
            ) : (
              <div className="space-y-5">
                {dashboard.assets.map((asset) => (
                  <article className="card space-y-5" key={asset.id}>
                    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-signal-green/20 bg-signal-green/10 px-3 py-1 text-xs font-semibold text-signal-green">
                            {brandAssetTypeLabels[asset.asset_type]}
                          </span>
                          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-300">
                            {brandAssetStatusLabels[asset.status]}
                          </span>
                        </div>
                        <h3 className="mt-3 text-2xl font-semibold text-white">
                          {asset.name}
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-slate-400">
                          {asset.description ||
                            summarizeBrandKitConfig(asset.config)}
                        </p>
                        <p className="mt-3 text-xs text-slate-500">
                          Aktualisiert: {formatDate(asset.updated_at)}
                        </p>
                      </div>
                      <BrandKitPreview asset={asset} />
                    </div>

                    <details className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <summary className="cursor-pointer text-sm font-semibold text-white">
                        Bearbeiten
                      </summary>
                      <div className="mt-4">
                        <BrandKitEditorForm
                          action={updateBrandKitAction}
                          asset={asset}
                          description="Aendere Metadaten und Config. Storage-Felder und Preview-URLs bleiben serverseitig kontrolliert."
                          submitLabel="Aenderungen speichern"
                          title="Brand Kit bearbeiten"
                        />
                      </div>
                    </details>

                    <form action={deleteBrandKitAction}>
                      <input
                        name="brandAssetId"
                        type="hidden"
                        value={asset.id}
                      />
                      <button
                        className="inline-flex min-h-10 items-center justify-center rounded-lg border border-signal-red/30 bg-signal-red/10 px-4 py-2 text-sm font-semibold text-signal-red transition hover:bg-signal-red/15"
                        type="submit"
                      >
                        {asset.hasStoredFile
                          ? "Datei und Brand Asset entfernen"
                          : "Brand Kit loeschen"}
                      </button>
                    </form>
                  </article>
                ))}
              </div>
            )}
          </section>
        </section>
      )}
    </div>
  );
}

function BrandingNotice({
  dataError,
  error,
  status,
}: {
  dataError: "load-failed" | null;
  error?: string;
  status?: string;
}) {
  const successMessages: Record<string, string> = {
    "brand-asset-uploaded": "Brand Asset wurde hochgeladen.",
    "brand-kit-created": "Brand Kit wurde erstellt.",
    "brand-kit-deleted": "Brand Kit wurde geloescht.",
    "brand-kit-updated": "Brand Kit wurde aktualisiert.",
  };
  const errorMessages: Record<string, string> = {
    "brand-asset-file-extension-mismatch":
      "Dateityp und Dateiendung passen nicht zusammen.",
    "brand-asset-file-required": "Bitte waehle eine Datei fuer den Upload.",
    "brand-asset-file-too-large": "Die Datei darf maximal 5 MB gross sein.",
    "brand-asset-file-type-not-supported":
      "Dieses Dateiformat wird fuer Brand Assets nicht unterstuetzt.",
    "brand-asset-upload-failed": "Brand Asset konnte nicht hochgeladen werden.",
    "brand-kit-create-failed": "Brand Kit konnte nicht gespeichert werden.",
    "brand-kit-delete-failed": "Brand Kit konnte nicht geloescht werden.",
    "brand-kit-load-failed": "Brand Kit konnte nicht geladen werden.",
    "brand-kit-not-found":
      "Brand Kit wurde nicht gefunden oder gehoert nicht zum aktuellen User.",
    "brand-kit-update-failed": "Brand Kit konnte nicht aktualisiert werden.",
    "invalid-brand-kit-config":
      "Config JSON muss ein gueltiges JSON-Objekt sein.",
    "invalid-brand-kit-form": "Brand Kit Formular ist ungueltig.",
    "supabase-not-configured": getSupabaseSetupNotice(
      "das echte Branding-CRUD aktiviert werden kann",
    ),
  };

  if (status && successMessages[status]) {
    return (
      <section className="rounded-lg border border-signal-green/30 bg-signal-green/10 p-4 text-sm text-signal-green">
        {successMessages[status]}
      </section>
    );
  }

  if (error && errorMessages[error]) {
    return (
      <section className="rounded-lg border border-signal-red/30 bg-signal-red/10 p-4 text-sm text-signal-red">
        {errorMessages[error]}
      </section>
    );
  }

  if (dataError === "load-failed") {
    return (
      <section className="rounded-lg border border-signal-red/30 bg-signal-red/10 p-4 text-sm text-signal-red">
        Brand Kits konnten nicht geladen werden. Es wurden keine internen
        Supabase-Details angezeigt.
      </section>
    );
  }

  return null;
}

function EmptyBrandKitState() {
  return (
    <section className="card space-y-4">
      <span className="inline-flex rounded-lg border border-brand-500/20 bg-brand-500/10 p-3 text-brand-500">
        <Palette className="h-5 w-5" aria-hidden="true" />
      </span>
      <div>
        <h3 className="text-lg font-semibold text-white">
          Noch kein Brand Kit
        </h3>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
          Erstelle zuerst ein Kit mit Name, Typ, Status und JSON-Config oder
          lade ein privates Brand Asset ueber das Upload-Formular hoch.
        </p>
      </div>
    </section>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
