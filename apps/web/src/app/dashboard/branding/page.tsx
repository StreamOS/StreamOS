import React from "react";
import { ArchiveRestore, Layers3, Sparkles } from "lucide-react";
import { StatCard } from "@streamos/ui";
import { BrandKitEditorForm } from "./BrandKitEditorForm";
import {
  createBrandKitAction,
  deleteBrandKitAction,
  updateBrandKitAction,
} from "./actions";
import {
  brandAssetStatusLabels,
  brandAssetTypeLabels,
  summarizeBrandKitConfig,
} from "./brand-kit";
import { getBrandKitDashboardData } from "./data";
import { isSupabaseConfigured } from "@/lib/supabase/config";

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
          <article className="card">
            <BrandKitEditorForm
              action={createBrandKitAction}
              description="Lege ein neues Brand Kit an, das direkt gegen `brand_assets` mit RLS gespeichert wird."
              submitLabel="Brand Kit speichern"
              title="Neues Brand Kit"
            />
          </article>

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
                      </div>
                      <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">
                        {brandAssetStatusLabels[asset.status]}
                      </span>
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
    "brand-kit-created":
      "Brand Kit wurde erstellt und via Supabase persistiert.",
    "brand-kit-deleted": "Brand Kit wurde geloescht.",
    "brand-kit-updated": "Brand Kit wurde aktualisiert.",
  };

  const errorMessages: Record<string, string> = {
    "brand-kit-create-failed":
      "Brand Kit konnte nicht gespeichert werden. Pruefe Supabase und die RLS-Policies.",
    "brand-kit-delete-failed":
      "Brand Kit konnte nicht geloescht werden. Pruefe, ob der Datensatz zum aktuellen User gehoert.",
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
