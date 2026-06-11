import React from "react";
import Link from "next/link";
import { ArchiveRestore, Layers3, Sparkles } from "lucide-react";
import { StatCard } from "@streamos/ui";
import { BrandAssetUploadForm } from "./BrandAssetUploadForm";
import { BrandKitEditorForm } from "./BrandKitEditorForm";
import {
  createBrandKitAction,
  deleteBrandKitAction,
  uploadBrandAssetFileAction,
  updateBrandKitAction,
} from "./actions";
import {
  brandAssetStatusLabels,
  brandAssetTypeLabels,
  summarizeBrandKitConfig,
} from "./brand-kit";
import {
  brandKitPresetTemplates,
  resolveBrandKitTemplateSelection,
} from "./brand-kit-presets";
import { getBrandKitDashboardData } from "./data";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type BrandingPageProps = {
  searchParams?: Promise<{
    error?: string;
    status?: string;
    template?: string;
  }>;
};

export default async function BrandingPage({
  searchParams,
}: BrandingPageProps) {
  const params = await searchParams;
  const configured = isSupabaseConfigured();
  const dashboard = await getBrandKitDashboardData();
  const selectedTemplate = resolveBrandKitTemplateSelection({
    assets: dashboard.assets,
    templateKey: params?.template ?? null,
  });

  return (
    <div className="space-y-6">
      <BrandingNotice error={params?.error} status={params?.status} />

      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-signal-green">
            Branding Studio
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-white">
            Brand Kits, Assets und visuelle Leitplanken
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
            Verwalte Brand Kits als RLS-geschuetzte Supabase-Datensaetze. Die
            erste Ausbaustufe bildet asset_type, status, name und config direkt
            auf `brand_assets` ab.
          </p>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard
          icon={Layers3}
          label="Brand Kits"
          tone="emerald"
          trend="Alle sichtbaren Brand Assets"
          value={String(dashboard.totalAssets)}
        />
        <StatCard
          icon={Sparkles}
          label="Aktive Kits"
          tone="violet"
          trend="Bereit fuer Live-Overlays und Alerts"
          value={String(dashboard.activeAssets)}
        />
        <StatCard
          icon={ArchiveRestore}
          label="Archiviert"
          tone="amber"
          trend="Historische Varianten und alte Layouts"
          value={String(dashboard.archivedAssets)}
        />
      </section>

      <section className="card space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.08em] text-signal-green">
              Presets
            </p>
            <h2 className="mt-2 text-lg font-semibold text-white">
              Template-Bibliothek
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              Waehle eine Vorlage und fuelle das Brand Kit damit vor. Du kannst
              entweder ein Preset nehmen oder ein bestehendes Brand Kit als
              Vorlage wiederverwenden.
            </p>
          </div>
          <Link className="btn-ghost self-start" href="/dashboard/branding">
            Vorlage leeren
          </Link>
        </div>

        {selectedTemplate && (
          <section className="rounded-lg border border-signal-green/20 bg-signal-green/10 p-4 text-sm text-signal-green">
            Aktive Vorlage: {selectedTemplate.label}
            <span className="ml-2 text-slate-300">
              {selectedTemplate.description}
            </span>
          </section>
        )}

        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
          {brandKitPresetTemplates.map((template) => {
            const isActive = selectedTemplate?.key === template.key;

            return (
              <article
                className={`rounded-lg border p-4 transition ${
                  isActive
                    ? "border-signal-green/40 bg-signal-green/10"
                    : "border-white/10 bg-white/5"
                }`}
                key={template.key}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-signal-green">
                      Preset
                    </p>
                    <h3 className="mt-2 text-lg font-semibold text-white">
                      {template.label}
                    </h3>
                  </div>
                  <span className="rounded-full border border-white/10 bg-surface-900/70 px-2.5 py-1 text-[11px] font-semibold text-slate-300">
                    {brandAssetTypeLabels[template.defaults.assetType]}
                  </span>
                </div>
                <p className="mt-3 text-sm text-slate-400">
                  {template.description}
                </p>
                <p className="mt-3 text-xs text-slate-500">
                  {summarizeBrandKitConfig(template.defaults.config)}
                </p>
                <Link
                  className="btn-primary mt-4 w-full"
                  href={`/dashboard/branding?template=${template.key}`}
                >
                  Vorlage verwenden
                </Link>
              </article>
            );
          })}
        </div>
      </section>

      {!configured ? (
        <section className="card space-y-3">
          <h2 className="text-lg font-semibold text-white">
            Supabase noch nicht konfiguriert
          </h2>
          <p className="text-sm text-slate-400">
            Das Branding-Modul laeuft lokal im Demo-Modus, bis
            `NEXT_PUBLIC_SUPABASE_URL` und
            `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` gesetzt sind. Die
            CRUD-Aktionen bleiben serverseitig auf die echte Supabase-Session
            ausgerichtet.
          </p>
        </section>
      ) : (
        <section className="grid gap-6 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <div className="space-y-6">
            <article className="card">
              <BrandAssetUploadForm action={uploadBrandAssetFileAction} />
            </article>

            <article className="card">
              <BrandKitEditorForm
                action={createBrandKitAction}
                defaults={selectedTemplate?.defaults ?? null}
                description="Lege ein neues Brand Kit an, das direkt gegen `brand_assets` mit RLS gespeichert wird."
                selectedTemplateDescription={
                  selectedTemplate?.description ?? null
                }
                selectedTemplateLabel={selectedTemplate?.label ?? null}
                submitLabel="Brand Kit speichern"
                title="Neues Brand Kit"
              />
            </article>
          </div>

          <section className="space-y-4">
            <div className="card">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    Vorhandene Brand Kits
                  </h2>
                  <p className="mt-1 text-sm text-slate-400">
                    {dashboard.assets.length > 0
                      ? `${dashboard.assets.length} Datensaetze geladen und nach Aktualisierung sortiert.`
                      : "Noch keine Brand Kits angelegt."}
                  </p>
                </div>
                <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-300">
                  Sichtbar fuer User {dashboard.userId ?? "n/a"}
                </div>
              </div>
            </div>

            {dashboard.assets.length === 0 ? (
              <EmptyBrandKitState />
            ) : (
              <div className="space-y-4">
                {dashboard.assets.map((asset) => (
                  <article className="card space-y-4" key={asset.id}>
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-signal-green">
                          {brandAssetTypeLabels[asset.asset_type]}
                        </p>
                        <h3 className="mt-2 text-xl font-semibold text-white">
                          {asset.name}
                        </h3>
                        <p className="mt-2 text-sm text-slate-400">
                          {summarizeBrandKitConfig(asset.config)}
                        </p>
                        {asset.public_url && (
                          <a
                            className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-signal-green hover:text-white"
                            href={asset.public_url}
                            rel="noreferrer"
                            target="_blank"
                          >
                            Datei oeffnen
                            <span className="text-xs text-slate-500">
                              {getBrandAssetFileName(asset)}
                            </span>
                          </a>
                        )}
                      </div>
                      <div className="flex flex-col items-start gap-2">
                        <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">
                          {brandAssetStatusLabels[asset.status]}
                        </span>
                        <Link
                          className="btn-ghost px-3 py-1.5 text-xs"
                          href={`/dashboard/branding?template=${asset.id}`}
                        >
                          Als Vorlage nutzen
                        </Link>
                      </div>
                    </div>

                    <BrandKitEditorForm
                      action={updateBrandKitAction}
                      asset={asset}
                      deleteAction={deleteBrandKitAction}
                      description="Bearbeite Typ, Status, Name und Config. Die Aenderung wird direkt auf dem bestehenden RLS-geschuetzten Datensatz gespeichert."
                      submitLabel="Aenderungen speichern"
                      title="Brand Kit bearbeiten"
                    />
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
  error,
  status,
}: {
  error?: string;
  status?: string;
}) {
  const successMessages: Record<string, string> = {
    "brand-asset-uploaded":
      "Brand Asset wurde hochgeladen und in Supabase Storage gespeichert.",
    "brand-kit-created":
      "Brand Kit wurde erstellt und via Supabase persistiert.",
    "brand-kit-deleted": "Brand Kit wurde geloescht.",
    "brand-kit-updated": "Brand Kit wurde aktualisiert.",
  };

  const errorMessages: Record<string, string> = {
    "brand-asset-upload-failed":
      "Brand Asset konnte nicht hochgeladen werden. Pruefe Supabase Storage und die Bucket-Policies.",
    "invalid-brand-asset-file":
      "Die Datei ist ungueltig oder wird nicht unterstuetzt.",
    "invalid-brand-asset-upload-config":
      "Die Upload-Config muss ein gueltiges JSON-Objekt sein.",
    "invalid-brand-asset-upload-form":
      "Das Upload-Formular ist ungueltig oder unvollstaendig.",
    "brand-kit-create-failed":
      "Brand Kit konnte nicht gespeichert werden. Pruefe Supabase und die RLS-Policies.",
    "brand-kit-delete-failed":
      "Brand Kit konnte nicht geloescht werden. Pruefe, ob der Datensatz zum aktuellen User gehoert.",
    "brand-kit-storage-delete-failed":
      "Die zugehoerige Datei konnte nicht aus Supabase Storage geloescht werden.",
    "brand-kit-load-failed":
      "Brand Kit konnte nicht geladen werden. Pruefe die Supabase-Verbindung.",
    "brand-kit-not-found":
      "Brand Kit wurde nicht gefunden oder gehoert nicht zum aktuellen User.",
    "brand-kit-update-failed":
      "Brand Kit konnte nicht aktualisiert werden. Pruefe die eingegebenen Werte.",
    "invalid-brand-kit-config":
      "Config JSON muss ein gueltiges JSON-Objekt sein.",
    "invalid-brand-kit-form":
      "Brand Kit Formular ist ungueltig oder unvollstaendig.",
    "supabase-not-configured":
      "Supabase ist nicht konfiguriert. Aktiviere die Umgebungsvariablen fuer das echte Branding-CRUD.",
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

  return null;
}

function EmptyBrandKitState() {
  return (
    <section className="card space-y-3">
      <h3 className="text-lg font-semibold text-white">Noch kein Brand Kit</h3>
      <p className="text-sm text-slate-400">
        Lege zuerst ein Kit an. Danach kannst du Varianten fuer Overlay, Banner,
        Alerts, Logos oder komplette Szene-Setups pflegen.
      </p>
      <ul className="grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
        <li className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
          `asset_type` definiert den visuell-logischen Typ des Kits.
        </li>
        <li className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
          `status` trennt Entwurf, aktive Live-Version und Archiv.
        </li>
        <li className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
          `config` speichert farbige Tokens, Typo-Infos und Layout-Parameter.
        </li>
        <li className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
          RLS sorgt dafuer, dass nur der eingeloggte User seine Assets sieht.
        </li>
      </ul>
    </section>
  );
}

function getBrandAssetFileName(asset: {
  metadata: unknown;
  public_url: string | null;
  storage_path: string | null;
}) {
  if (asset.metadata && typeof asset.metadata === "object") {
    const fileName = (asset.metadata as Record<string, unknown>).file_name;

    if (typeof fileName === "string" && fileName.trim()) {
      return fileName;
    }
  }

  if (asset.storage_path) {
    return asset.storage_path.split("/").pop() ?? "uploaded-asset";
  }

  if (asset.public_url) {
    return "uploaded-asset";
  }

  return "uploaded-asset";
}
