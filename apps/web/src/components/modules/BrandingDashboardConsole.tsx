import React from "react";
import { Archive, Image, Layers3, Palette, ShieldCheck } from "lucide-react";
import {
  BRANDING_DASHBOARD_UPLOAD_ALLOWED_MIME_TYPES,
  BRANDING_DASHBOARD_UPLOAD_MAX_FILE_SIZE_BYTES,
} from "@streamos/types";
import { StatCard } from "@streamos/ui";
import { getSupabaseSetupNotice } from "@/lib/supabase/messages";
import {
  formatBrandingAssetStatusLabel,
  formatBrandingAssetTypeLabel,
  formatBrandingDateTime,
  formatBrandingFutureActionLabel,
  formatBrandingMutationReasonLabel,
  formatBrandingPlatformLabel,
  formatBrandingPreviewReasonLabel,
  formatBrandingPreviewStatusLabel,
  formatBrandingStorageStateLabel,
  type BrandingDashboardModel,
} from "./BrandingDashboardConsole.utils";

type BrandingDashboardConsoleProps = {
  model: BrandingDashboardModel;
  uploadAction: (formData: FormData) => Promise<void>;
  uploadFeedback: {
    message: string;
    tone: "error" | "success";
  } | null;
};

export function BrandingDashboardConsole({
  model,
  uploadAction,
  uploadFeedback,
}: BrandingDashboardConsoleProps) {
  const hasLookupIssues = model.lookupIssues.length > 0;
  const showPartialNotice = model.state === "ready" && hasLookupIssues;
  const hasData = model.items.length > 0;
  const previewReadyCount = model.items.filter(
    (item) => item.preview.status === "available",
  ).length;
  const uploadEnabled = model.state === "ready";

  return (
    <div className="space-y-6">
      {model.state === "disabled" && <DisabledNotice />}
      {model.state === "unauthorized" && <UnauthorizedNotice />}
      {model.state === "auth-failed" && <AuthFailedNotice />}
      {model.state === "load-failed" && <LoadFailedNotice />}
      {uploadFeedback && <UploadFeedbackNotice feedback={uploadFeedback} />}
      {model.feed.hasMore && <FeedScopeNotice model={model} />}
      {showPartialNotice && <PartialLoadNotice />}

      <header className="grid gap-6 rounded-lg border border-white/10 bg-surface-900/85 p-6 shadow-[0_22px_70px_rgba(0,0,0,0.42)] xl:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-signal-green">
            Branding MVP
          </p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-normal text-white md:text-5xl">
            Brand Assets mit server-owned Upload und privaten Preview-Sichten
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-400">
            Diese Surface zeigt vorhandene `brand_assets` tenant-scoped, erlaubt
            neue Create-Uploads und haelt Replace-, Delete- und Edit-Semantik
            bewusst nur als disabled Future-Contract sichtbar. Private Previews
            werden nur serverseitig und kurzlebig signiert.
          </p>
        </div>

        <aside className="rounded-lg border border-white/10 bg-white/5 p-4">
          <div className="flex items-center gap-3">
            <span className="rounded-lg border border-brand-500/20 bg-brand-500/10 p-2 text-brand-500">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-400">
                Contract Scope
              </p>
              <h2 className="mt-1 text-lg font-semibold text-white">
                Read-first Branding Surface
              </h2>
            </div>
          </div>
          <ul className="mt-4 space-y-2 text-sm leading-6 text-slate-300">
            <li>Owner boundary: `user_id` via authenticated Supabase reads.</li>
            <li>
              Keine Storage-Writes, keine Service-Role, keine persistente
              oeffentliche Asset-URL.
            </li>
            <li>
              Signed Preview URLs werden nur serverseitig und kurzlebig erzeugt.
            </li>
            <li>
              Uploads bleiben create-only, tenant-scoped und ohne dauerhafte
              oeffentliche Asset-URL.
            </li>
            <li>
              Replace, Delete und Orphan Cleanup bleiben bewusst contract-only
              und ohne aktive Mutation.
            </li>
          </ul>
        </aside>
      </header>

      {uploadEnabled ? (
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <article className="card space-y-4">
            <SectionHeader
              title="Brand Asset Upload"
              description="Neues Brand Asset serverseitig in den privaten Bucket schreiben, danach Metadaten in `brand_assets` persistieren."
            />

            <form action={uploadAction} className="grid gap-4">
              <label className="grid gap-2 text-sm font-semibold text-slate-300">
                Datei
                <input
                  accept={BRANDING_DASHBOARD_UPLOAD_ALLOWED_MIME_TYPES.join(
                    ",",
                  )}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 file:mr-4 file:rounded-md file:border-0 file:bg-signal-green/15 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-signal-green"
                  name="assetFile"
                  required
                  type="file"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-[220px_minmax(0,1fr)]">
                <label className="grid gap-2 text-sm font-semibold text-slate-300">
                  Asset-Typ
                  <select
                    className="rounded-lg border border-white/10 bg-surface-900 px-3 py-2 text-white outline-none transition focus:border-signal-green"
                    defaultValue="logo"
                    name="assetType"
                  >
                    {UPLOAD_ASSET_TYPES.map((assetType) => (
                      <option key={assetType} value={assetType}>
                        {formatBrandingAssetTypeLabel(assetType)}
                      </option>
                    ))}
                  </select>
                </label>

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
              </div>

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

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 p-4">
                <div className="space-y-1 text-sm leading-6 text-slate-300">
                  <p>
                    Erlaubte Formate:{" "}
                    {BRANDING_DASHBOARD_UPLOAD_ALLOWED_MIME_TYPES.join(", ")}
                  </p>
                  <p>
                    Maximale Groesse:{" "}
                    {formatBrandingUploadSizeLabel(
                      BRANDING_DASHBOARD_UPLOAD_MAX_FILE_SIZE_BYTES,
                    )}
                  </p>
                  <p className="text-xs text-slate-500">
                    SVG, Replace, Delete, Edit und Public-URL-Logik bleiben
                    ausserhalb dieses Slices.
                  </p>
                </div>
                <button
                  className="btn-primary min-h-10 px-4 py-2"
                  type="submit"
                >
                  Brand Asset hochladen
                </button>
              </div>
            </form>
          </article>

          <article className="card space-y-4">
            <SectionHeader
              title="Upload Contract"
              description="Die Upload-Runtime bleibt minimal, tenant-scoped und ohne implizite Replace-, Delete- oder Orphan-Cleanup-Semantik."
            />

            <div className="space-y-3 rounded-lg border border-white/10 bg-white/5 p-4 text-sm leading-6 text-slate-300">
              <p>Private Dateien landen im Bucket `brand-assets`.</p>
              <p>Storage-Pfade beginnen mit der aktuellen `user_id`.</p>
              <p>
                Persistiert werden nur sichere Metadaten und keine dauerhafte
                oeffentliche Asset-URL.
              </p>
              <p>
                Previews entstehen spaeter nur ueber den bestehenden
                Signed-Preview-Contract.
              </p>
            </div>

            <div className="space-y-3 rounded-lg border border-dashed border-white/10 bg-surface-950/70 p-4 text-sm leading-6 text-slate-300">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                Future Mutation Contract
              </p>
              {Object.values(model.mutationContract).map((entry) => (
                <div
                  key={entry.action}
                  className="rounded-lg border border-white/10 bg-white/5 p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-white">
                      {formatBrandingFutureActionLabel(entry.action)}
                    </p>
                    <span className="rounded-full border border-white/10 bg-surface-950/70 px-3 py-1 text-xs font-semibold text-slate-300">
                      blocked
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-400">
                    {formatBrandingMutationReasonLabel(entry.reason)}
                  </p>
                </div>
              ))}
            </div>
          </article>
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Layers3}
          label="Brand Assets"
          tone="emerald"
          trend="Tenant-scoped Feed"
          value={String(model.summary.totalAssets)}
        />
        <StatCard
          icon={Palette}
          label="Aktiv"
          tone="violet"
          trend="Nutzbare Assets"
          value={String(model.summary.activeAssets)}
        />
        <StatCard
          icon={Image}
          label="Preview Ready"
          tone="amber"
          trend="Kurzlebig server-signiert"
          value={String(previewReadyCount)}
        />
        <StatCard
          icon={Archive}
          label="Missing Brand Kit"
          tone="rose"
          trend="Logo oder Color Palette fehlen"
          value={model.summary.missingBrandKit ? "Ja" : "Nein"}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1.35fr)]">
        <article className="card space-y-4">
          <SectionHeader
            title="Brand Assets Summary"
            description="Uebersicht ueber Typen, Storage-Verfuegbarkeit, Preview-Bereitschaft und die zuletzt aktualisierten Brand Assets."
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <InfoTile
              label="Asset Types"
              value={String(model.coverage.typeCount)}
            />
            <InfoTile
              label="Platforms"
              value={String(model.coverage.platformCount)}
            />
            <InfoTile
              label="Channel Context"
              value={String(model.coverage.channelContextCount)}
            />
            <InfoTile
              label="Storage Incomplete"
              value={String(model.coverage.incompleteStorageCount)}
            />
            <InfoTile
              label="Draft Assets"
              value={String(model.summary.draftAssets)}
            />
            <InfoTile
              label="Latest Update"
              value={formatBrandingDateTime(model.summary.latestUpdatedAt)}
            />
          </div>

          <section className="rounded-lg border border-white/10 bg-white/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
              Missing Brand Kit Hinweis
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              {model.summary.missingBrandKit
                ? "Ein vollstaendiges Basiskit ist noch nicht erkennbar. Mindestens Logo oder Color Palette fehlen in aktiven Assets."
                : "Logo und Color Palette sind in aktiven Assets vorhanden."}
            </p>
            <p className="mt-3 text-xs leading-6 text-slate-500">
              Private Preview-URLs bleiben kurzlebig und werden weder in der
              Datenbank persistiert noch als Debug-String ausgegeben.
            </p>
          </section>
        </article>

        <article className="card space-y-4">
          <SectionHeader
            title="Asset Type Distribution"
            description="Verteilung der geladenen Asset-Typen aus der begrenzten Branding-Stichprobe."
          />

          {model.typeDistribution.length > 0 ? (
            <div className="space-y-3">
              {model.typeDistribution.map((item) => (
                <article
                  key={item.key}
                  className="rounded-lg border border-white/10 bg-white/5 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-white">
                        {formatBrandingAssetTypeLabel(item.key)}
                      </h3>
                      <p className="mt-1 text-xs text-slate-500">{item.key}</p>
                    </div>
                    <span className="rounded-full border border-white/10 bg-surface-950/70 px-3 py-1 text-xs font-semibold text-slate-200">
                      {item.count}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          ) : model.state !== "ready" ? (
            <StateEmptyState state={model.state} />
          ) : (
            <EmptyState
              title="Noch keine Asset-Typen"
              body="Sobald Brand Assets vorhanden sind, zeigt StreamOS hier die Verteilung der geladenen Typen."
            />
          )}
        </article>
      </section>

      <section className="card space-y-4">
        <SectionHeader
          title="Recent Brand Assets"
          description="Neueste Brand Assets mit Typ, Status, optionalem Plattformkontext und sicherer Storage-Verfuegbarkeit."
        />

        {hasData ? (
          <div className="space-y-3">
            {model.items.map((item) => (
              <article
                key={item.id}
                className="rounded-lg border border-white/10 bg-white/5 p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone="emerald">
                    {formatBrandingAssetTypeLabel(item.assetType)}
                  </Pill>
                  <Pill tone="violet">
                    {formatBrandingAssetStatusLabel(item.status)}
                  </Pill>
                  <Pill tone="slate">
                    {formatBrandingStorageStateLabel(item.storageState)}
                  </Pill>
                  {item.platform !== null && (
                    <Pill tone="amber">
                      {formatBrandingPlatformLabel(item.platform)}
                    </Pill>
                  )}
                </div>

                <h3 className="mt-3 text-xl font-semibold text-white">
                  {item.name}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  {item.description ?? "Keine Asset-Beschreibung vorhanden."}
                </p>

                <div className="mt-4 space-y-2 rounded-lg border border-dashed border-white/10 bg-surface-950/70 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                      Future Actions
                    </p>
                    <span className="text-xs text-slate-500">
                      Contract only
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {item.futureActions.map((action) => (
                      <button
                        key={`${item.id}-${action.action}`}
                        aria-disabled="true"
                        className="cursor-not-allowed rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-500 opacity-80"
                        disabled
                        title={formatBrandingMutationReasonLabel(action.reason)}
                        type="button"
                      >
                        {formatBrandingFutureActionLabel(action.action)} spaeter
                      </button>
                    ))}
                  </div>
                  <p className="text-xs leading-5 text-slate-500">
                    Replace und Delete bleiben blockiert, bis DB-Row,
                    Storage-Objekt und Cleanup-Failures gemeinsam serverseitig
                    orchestriert werden.
                  </p>
                </div>

                <div className="mt-4 rounded-lg border border-white/10 bg-surface-950/70 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                      Private Preview
                    </p>
                    <span className="text-xs font-medium text-slate-400">
                      {formatBrandingPreviewStatusLabel(item.preview.status)}
                    </span>
                  </div>

                  {item.preview.status === "available" && item.preview.url ? (
                    <div className="mt-3 space-y-3">
                      {/* Signed preview URLs are short-lived and rendered as-is in the dashboard. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        alt={`${item.name} preview`}
                        className="h-40 w-full rounded-lg border border-white/10 bg-surface-950 object-contain"
                        loading="lazy"
                        src={item.preview.url}
                      />
                      <p className="text-xs leading-5 text-slate-500">
                        Kurzlebige Preview fuer diese Dashboard-Response.
                        Ablauf: {formatBrandingDateTime(item.preview.expiresAt)}
                      </p>
                    </div>
                  ) : (
                    <div className="mt-3 rounded-lg border border-dashed border-white/10 bg-white/5 p-4">
                      <p className="text-sm font-medium text-slate-200">
                        Kein gerendertes Thumbnail
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-400">
                        {formatBrandingPreviewReasonLabel(item.preview.reason)}
                      </p>
                    </div>
                  )}
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <InfoTile
                    label="Usage Context"
                    value={item.usageContext ?? "Globales Brand Asset"}
                  />
                  <InfoTile
                    label="Platform"
                    value={formatBrandingPlatformLabel(item.platform)}
                  />
                  <InfoTile
                    label="Created"
                    value={formatBrandingDateTime(item.createdAt)}
                  />
                  <InfoTile
                    label="Updated"
                    value={formatBrandingDateTime(item.updatedAt)}
                  />
                </div>
              </article>
            ))}
          </div>
        ) : model.state !== "ready" ? (
          <StateEmptyState state={model.state} />
        ) : hasLookupIssues ? (
          <EmptyState
            title="Teilweise geladene Brand Assets"
            body="Assets sind geladen, aber optionale Lookup-Kontexte fehlen noch teilweise."
          />
        ) : (
          <EmptyState
            title="Noch keine Brand Assets"
            body="Sobald `brand_assets` fuer den aktuellen User vorhanden sind, zeigt StreamOS hier die read-only Branding-Surface."
          />
        )}
      </section>
    </div>
  );
}

function DisabledNotice() {
  return (
    <section className="rounded-lg border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">
      {getSupabaseSetupNotice(
        "das Branding Dashboard echte Brand Assets read-only anzeigen kann",
      )}
    </section>
  );
}

function UploadFeedbackNotice({
  feedback,
}: {
  feedback: {
    message: string;
    tone: "error" | "success";
  };
}) {
  const className =
    feedback.tone === "success"
      ? "border-signal-green/30 bg-signal-green/10 text-signal-green"
      : "border-signal-red/30 bg-signal-red/10 text-signal-red";

  return (
    <section className={`rounded-lg border p-4 text-sm ${className}`}>
      {feedback.message}
    </section>
  );
}

function UnauthorizedNotice() {
  return (
    <section className="rounded-lg border border-signal-red/30 bg-signal-red/10 p-4 text-sm text-signal-red">
      Melde dich mit einer gueltigen Dashboard-Session an, bevor du das Branding
      Dashboard oeffnest.
    </section>
  );
}

function AuthFailedNotice() {
  return (
    <section className="rounded-lg border border-signal-red/30 bg-signal-red/10 p-4 text-sm text-signal-red">
      Die Dashboard-Session konnte nicht geladen werden. Branding bleibt
      read-only und zeigt keine internen Auth- oder Supabase-Details an.
    </section>
  );
}

function LoadFailedNotice() {
  return (
    <section className="rounded-lg border border-signal-red/30 bg-signal-red/10 p-4 text-sm text-signal-red">
      Brand Assets konnten nicht geladen werden. Es wurden keine privaten
      Storage-URLs, Rohpayloads oder internen Fehlermetadaten angezeigt.
    </section>
  );
}

function PartialLoadNotice() {
  return (
    <section className="rounded-lg border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">
      Einige optionale Branding-Lookups konnten nicht geladen werden. StreamOS
      zeigt vorhandene Assets weiter read-only an und ersetzt fehlende Kontexte
      durch unavailable Labels.
    </section>
  );
}

function FeedScopeNotice({ model }: { model: BrandingDashboardModel }) {
  return (
    <section className="rounded-lg border border-brand-500/20 bg-brand-500/10 p-4 text-sm text-brand-500">
      Diese Surface zeigt die neuesten {model.feed.returnedCount} Brand Assets
      aus einer Stichprobe mit Limit {model.feed.limit}. Weitere Assets bleiben
      ausserhalb dieses MVP-Fensters.
    </section>
  );
}

function SectionHeader({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-slate-400">{description}</p>
    </div>
  );
}

function EmptyState({ body, title }: { body: string; title: string }) {
  return (
    <section className="rounded-lg border border-dashed border-white/10 bg-surface-950/80 p-4">
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-400">{body}</p>
    </section>
  );
}

function StateEmptyState({
  state,
}: {
  state: BrandingDashboardModel["state"];
}) {
  if (state === "unauthorized") {
    return (
      <EmptyState
        title="Dashboard-Session erforderlich"
        body="Ohne Dashboard-Session kann StreamOS keine tenant-scoped Brand Assets lesen."
      />
    );
  }

  if (state === "disabled") {
    return (
      <EmptyState
        title="Supabase nicht konfiguriert"
        body="Das Branding Dashboard bleibt deaktiviert, bis die lokale Supabase-Konfiguration gesetzt ist."
      />
    );
  }

  return (
    <EmptyState
      title="Branding konnte nicht geladen werden"
      body="Die read-only Branding-Surface bleibt leer, solange keine sichere Dashboard-Lesebasis verfuegbar ist."
    />
  );
}

function InfoTile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-surface-950/70 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </p>
      <div className="mt-2 text-sm leading-6 text-white">{value}</div>
    </div>
  );
}

function Pill({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "amber" | "emerald" | "slate" | "violet";
}) {
  const classes = {
    amber: "border-amber-300/30 bg-amber-300/10 text-amber-200",
    emerald: "border-signal-green/20 bg-signal-green/10 text-signal-green",
    slate: "border-white/10 bg-white/5 text-slate-300",
    violet: "border-brand-500/20 bg-brand-500/10 text-brand-500",
  };

  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-semibold ${classes[tone]}`}
    >
      {children}
    </span>
  );
}

function formatBrandingUploadSizeLabel(bytes: number): string {
  return `${Math.floor(bytes / (1024 * 1024))} MB`;
}

const UPLOAD_ASSET_TYPES = [
  "logo",
  "overlay",
  "banner",
  "panel",
  "alert",
  "scene",
  "emote",
  "color_palette",
  "typography",
] as const;
