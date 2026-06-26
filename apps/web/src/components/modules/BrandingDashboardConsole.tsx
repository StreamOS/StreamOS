import React from "react";
import Link from "next/link";
import { Archive, Image, Layers3, Palette, ShieldCheck } from "lucide-react";
import {
  BRANDING_DASHBOARD_UPLOAD_ALLOWED_MIME_TYPES,
  BRANDING_DASHBOARD_UPLOAD_MAX_FILE_SIZE_BYTES,
} from "@streamos/types";
import { StatCard } from "@streamos/ui";
import { getSupabaseSetupNotice } from "@/lib/supabase/messages";
import {
  encodeBrandingDashboardCursorToken,
  BRANDING_DASHBOARD_METADATA_FILTERS,
  BRANDING_DASHBOARD_MAX_WINDOWS,
  BRANDING_DASHBOARD_PREVIEW_FILTERS,
  BRANDING_DASHBOARD_SORT_OPTIONS,
  formatBrandingAssetStatusLabel,
  formatBrandingAssetTypeLabel,
  formatBrandingDashboardFeedScopeLabel,
  formatBrandingDashboardSortLabel,
  formatBrandingDateTime,
  formatBrandingFileSizeLabel,
  formatBrandingFutureActionLabel,
  formatBrandingMutationReasonLabel,
  formatBrandingPlatformLabel,
  formatBrandingPreviewReasonLabel,
  formatBrandingPreviewStatusLabel,
  formatBrandingStorageStateLabel,
  formatBrandingUploadMetadataStatusLabel,
  formatBrandingUploadMetadataTypeLabel,
  type BrandingDashboardModel,
  type BrandingDashboardViewModel,
} from "./BrandingDashboardConsole.utils";

type BrandingDashboardConsoleProps = {
  model: BrandingDashboardModel;
  uploadAction: (formData: FormData) => Promise<void>;
  uploadFeedback: {
    message: string;
    tone: "error" | "success";
  } | null;
  view: BrandingDashboardConsoleView;
};

export type BrandingDashboardConsoleView = BrandingDashboardViewModel;

export function BrandingDashboardConsole({
  model,
  uploadAction,
  uploadFeedback,
  view,
}: BrandingDashboardConsoleProps) {
  const hasLookupIssues = model.lookupIssues.length > 0;
  const showPartialNotice = model.state === "ready" && hasLookupIssues;
  const hasData = model.items.length > 0;
  const hasVisibleItems = view.items.length > 0;
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
      {model.feed.scope === "loaded_sample" && (
        <FeedScopeNotice model={model} />
      )}
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

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
        <article className="card space-y-4">
          <SectionHeader
            title="Asset Explorer"
            description="Read-only Feed mit Filterung, Sortierung und klarer Asset-Auswahl auf Basis der bereits geladenen Branding-Stichprobe."
          />

          <BrandingFilterForm view={view} />

          <div className="grid gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300 md:grid-cols-3">
            <p>
              Sortierung:{" "}
              <span className="font-semibold text-white">
                {formatBrandingDashboardSortLabel(view.feed.activeSort)}
              </span>
            </p>
            <p>
              Feed Scope:{" "}
              <span className="font-semibold text-white">
                {formatBrandingDashboardFeedScopeLabel(view.feed.scope)}
              </span>
            </p>
            <p>
              Zeige{" "}
              <span className="font-semibold text-white">
                {view.feed.visibleCount}
              </span>
              {view.feed.scope === "loaded_sample"
                ? ` von ${view.feed.returnedCount} geladenen Assets`
                : ` von ${view.feed.returnedCount} Assets im Feed`}
            </p>
          </div>

          <ExplorerFeedNotice view={view} />

          {hasData ? (
            hasVisibleItems ? (
              <>
                <div className="space-y-3">
                  {view.items.map((item) => (
                    <AssetExplorerCard
                      isSelected={view.detailAssetId === item.id}
                      item={item}
                      view={view}
                      key={item.id}
                    />
                  ))}
                </div>
                <LoadMoreSection view={view} />
              </>
            ) : (
              <EmptyState
                title="Keine Assets fuer aktuelle Filter"
                body={
                  view.feed.scope === "loaded_sample"
                    ? "Die aktuellen Filter wirken nur auf die geladene Branding-Stichprobe. Passe Filter an oder beachte, dass weitere aeltere Assets ausserhalb dieses Feed-Fensters existieren koennen."
                    : "Passe Asset Type, Status, Preview oder Metadata-Filter an, um wieder Ergebnisse zu sehen."
                }
              />
            )
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
        </article>

        <article className="card space-y-4">
          <SectionHeader
            title="Asset Detail"
            description="Read-only Detailansicht mit Preview, Metadata und bewusst disabled Future-Actions."
          />

          {view.detailSelection.fellBackToVisibleItem ? (
            <DetailSelectionNotice view={view} />
          ) : null}

          {view.selectedAsset ? (
            <AssetDetailPanel item={view.selectedAsset} />
          ) : (
            <EmptyState
              title="Kein Detail verfuegbar"
              body="Waehle ein Asset aus oder loese Filter, damit wieder ein Detailbereich sichtbar wird."
            />
          )}
        </article>
      </section>
    </div>
  );
}

function getTrustedUploadMetadataFields(
  uploadMetadata: BrandingDashboardViewModel["items"][number]["uploadMetadata"],
) {
  if (uploadMetadata.status !== "available") {
    return {
      contentType: null,
      fileExtension: null,
      fileSizeBytes: null,
      storedFilename: null,
    };
  }

  return {
    contentType: uploadMetadata.contentType,
    fileExtension: uploadMetadata.fileExtension,
    fileSizeBytes: uploadMetadata.fileSizeBytes,
    storedFilename: uploadMetadata.storedFilename,
  };
}

function ExplorerFeedNotice({ view }: { view: BrandingDashboardConsoleView }) {
  const activeFilterSummary = formatBrandingActiveFilterSummary(view);

  return (
    <section className="rounded-lg border border-white/10 bg-surface-950/70 p-4 text-sm leading-6 text-slate-300">
      <p>
        {view.feed.scope === "loaded_sample"
          ? `Filter und Sortierung wirken aktuell nur auf ${view.feed.returnedCount} geladene Brand Assets aus dem neuesten Feed-Fenster mit Limit ${view.feed.limit}.`
          : `Filter und Sortierung wirken auf den aktuell vollstaendig geladenen Branding-Feed mit ${view.feed.returnedCount} Assets.`}
      </p>
      <p className="mt-2 text-xs text-slate-500">{activeFilterSummary}</p>
      <p className="mt-2 text-xs text-slate-500">
        Serverseitig geladen wird aktuell nur die Sortierung{" "}
        {formatBrandingDashboardSortLabel(view.feed.serverSort)}.
        {view.feed.scope === "loaded_sample" && view.feed.hasMore
          ? " Weitere Assets existieren bereits; ueber den Cursor-Contract kann das Feed-Fenster schrittweise erweitert werden."
          : " Zusaetzliche Explorer-Filter bleiben clientseitig und read-only."}
      </p>
    </section>
  );
}

function LoadMoreSection({ view }: { view: BrandingDashboardConsoleView }) {
  if (!view.feed.hasMore || !view.feed.nextCursor) {
    return null;
  }

  if (view.feed.windowCount >= BRANDING_DASHBOARD_MAX_WINDOWS) {
    return (
      <section className="rounded-lg border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">
        Das aktuell freigegebene Branding-Fenster ist erreicht. Weitere Assets
        bleiben serverseitig begrenzt, bis ein groesserer Pagination-Scope
        freigegeben wird.
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-brand-500/20 bg-brand-500/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-white">
            Weitere Assets laden
          </p>
          <p className="text-sm leading-6 text-slate-300">
            Der Explorer erweitert das geladene Feed-Fenster cursor-basiert um
            die naechste serverseitige Asset-Seite.
          </p>
        </div>
        <Link
          className="btn-primary min-h-10 px-4 py-2"
          href={buildBrandingLoadMoreHref(view)}
        >
          Mehr laden
        </Link>
      </div>
    </section>
  );
}

function DetailSelectionNotice({
  view,
}: {
  view: BrandingDashboardConsoleView;
}) {
  return (
    <section className="rounded-lg border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">
      Das angeforderte Asset liegt nicht mehr im aktuell sichtbaren Feed.
      StreamOS zeigt stattdessen das erste sichtbare Asset innerhalb der aktiven
      Explorer-Filter.
    </section>
  );
}

function BrandingFilterForm({ view }: { view: BrandingDashboardConsoleView }) {
  return (
    <form className="grid gap-4 rounded-lg border border-white/10 bg-white/5 p-4 lg:grid-cols-[repeat(4,minmax(0,1fr))]">
      <label className="grid gap-2 text-sm font-semibold text-slate-300">
        Asset Type
        <select
          className="rounded-lg border border-white/10 bg-surface-900 px-3 py-2 text-white outline-none transition focus:border-signal-green"
          defaultValue={view.filters.assetType ?? "all"}
          name="assetType"
        >
          <option value="all">Alle Asset-Typen</option>
          {view.assetTypeOptions.map((assetType) => (
            <option key={assetType} value={assetType}>
              {formatBrandingAssetTypeLabel(assetType)}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-2 text-sm font-semibold text-slate-300">
        Status
        <select
          className="rounded-lg border border-white/10 bg-surface-900 px-3 py-2 text-white outline-none transition focus:border-signal-green"
          defaultValue={view.filters.status ?? "all"}
          name="statusFilter"
        >
          <option value="all">Alle Status</option>
          {view.statusOptions.map((status) => (
            <option key={status} value={status}>
              {formatBrandingAssetStatusLabel(status)}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-2 text-sm font-semibold text-slate-300">
        Preview
        <select
          className="rounded-lg border border-white/10 bg-surface-900 px-3 py-2 text-white outline-none transition focus:border-signal-green"
          defaultValue={view.filters.preview}
          name="preview"
        >
          {BRANDING_DASHBOARD_PREVIEW_FILTERS.map((preview) => (
            <option key={preview} value={preview}>
              {formatBrandingPreviewFilterLabel(preview)}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-2 text-sm font-semibold text-slate-300">
        Metadata
        <select
          className="rounded-lg border border-white/10 bg-surface-900 px-3 py-2 text-white outline-none transition focus:border-signal-green"
          defaultValue={view.filters.metadata}
          name="metadata"
        >
          {BRANDING_DASHBOARD_METADATA_FILTERS.map((metadata) => (
            <option key={metadata} value={metadata}>
              {formatBrandingMetadataFilterLabel(metadata)}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-2 text-sm font-semibold text-slate-300 lg:col-span-2">
        Sortierung
        <select
          className="rounded-lg border border-white/10 bg-surface-900 px-3 py-2 text-white outline-none transition focus:border-signal-green"
          defaultValue={view.sort}
          name="sort"
        >
          {BRANDING_DASHBOARD_SORT_OPTIONS.map((sort) => (
            <option key={sort} value={sort}>
              {formatBrandingDashboardSortLabel(sort)}
            </option>
          ))}
        </select>
      </label>

      <div className="flex items-end gap-3 lg:col-span-2">
        <button className="btn-primary min-h-10 px-4 py-2" type="submit">
          Filter anwenden
        </button>
        <Link
          className="rounded-lg border border-white/10 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:border-white/20 hover:text-white"
          href="/dashboard/branding"
        >
          Filter zuruecksetzen
        </Link>
      </div>
    </form>
  );
}

function AssetExplorerCard({
  isSelected,
  item,
  view,
}: {
  isSelected: boolean;
  item: BrandingDashboardViewModel["items"][number];
  view: BrandingDashboardConsoleView;
}) {
  const trustedMetadata = getTrustedUploadMetadataFields(item.uploadMetadata);

  return (
    <article
      className={`rounded-lg border p-4 ${
        isSelected
          ? "border-brand-500/40 bg-brand-500/10"
          : "border-white/10 bg-white/5"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="emerald">
              {formatBrandingAssetTypeLabel(item.assetType)}
            </Pill>
            <Pill tone="violet">
              {formatBrandingAssetStatusLabel(item.status)}
            </Pill>
            <Pill tone="slate">
              {formatBrandingPreviewStatusLabel(item.preview.status)}
            </Pill>
            <Pill tone="amber">
              {formatBrandingUploadMetadataStatusLabel(item.uploadMetadata)}
            </Pill>
          </div>
          <h3 className="text-lg font-semibold text-white">{item.name}</h3>
          <p className="text-sm leading-6 text-slate-400">
            {item.description ?? "Keine Asset-Beschreibung vorhanden."}
          </p>
        </div>

        <Link
          className="rounded-full border border-white/10 bg-surface-950/70 px-3 py-1 text-xs font-semibold text-slate-200 transition hover:border-brand-500/40 hover:text-white"
          href={buildBrandingViewHref(view, item.id)}
        >
          Details ansehen
        </Link>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <InfoTile
          label="Dateityp"
          value={formatBrandingUploadMetadataTypeLabel(item.uploadMetadata)}
        />
        <InfoTile
          label="Dateigroesse"
          value={formatBrandingFileSizeLabel(trustedMetadata.fileSizeBytes)}
        />
        <InfoTile
          label="Updated"
          value={formatBrandingDateTime(item.updatedAt)}
        />
        <InfoTile
          label="Platform"
          value={formatBrandingPlatformLabel(item.platform)}
        />
      </div>
    </article>
  );
}

function AssetDetailPanel({
  item,
}: {
  item: BrandingDashboardViewModel["selectedAsset"];
}) {
  if (!item) {
    return null;
  }

  const trustedMetadata = getTrustedUploadMetadataFields(item.uploadMetadata);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-white/10 bg-white/5 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone="emerald">
                {formatBrandingAssetTypeLabel(item.assetType)}
              </Pill>
              <Pill tone="violet">
                {formatBrandingAssetStatusLabel(item.status)}
              </Pill>
            </div>
            <h3 className="mt-3 text-xl font-semibold text-white">
              {item.name}
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              {item.description ?? "Keine Asset-Beschreibung vorhanden."}
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-surface-950/70 px-3 py-2 text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
              Preview Status
            </p>
            <p className="mt-1 text-sm font-semibold text-white">
              {formatBrandingPreviewStatusLabel(item.preview.status)}
            </p>
          </div>
        </div>
      </div>

      <section className="rounded-lg border border-white/10 bg-white/5 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
          Private Preview
        </p>
        {item.preview.status === "available" && item.preview.url ? (
          <div className="mt-3 space-y-3">
            <img
              alt={`${item.name} preview`}
              className="max-h-80 w-full rounded-lg border border-white/10 bg-surface-950 object-contain"
              decoding="async"
              loading="lazy"
              src={item.preview.url}
            />
            <p className="text-xs leading-6 text-slate-500">
              Kurzlebige Preview nur fuer diese Dashboard-Response. Die URL wird
              nicht persistiert oder als Debug-Text angezeigt.
            </p>
          </div>
        ) : (
          <div className="mt-3 rounded-lg border border-dashed border-white/10 bg-surface-950/80 p-4">
            <p className="text-sm font-semibold text-white">
              Kein gerendertes Thumbnail
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              {formatBrandingPreviewReasonLabel(item.preview.reason)}
            </p>
          </div>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <InfoTile label="Name" value={item.name} />
        <InfoTile
          label="Asset Type"
          value={formatBrandingAssetTypeLabel(item.assetType)}
        />
        <InfoTile
          label="Status"
          value={formatBrandingAssetStatusLabel(item.status)}
        />
        <InfoTile
          label="Storage Status"
          value={formatBrandingStorageStateLabel(item.storageState)}
        />
        <InfoTile
          label="Preview-Status"
          value={formatBrandingPreviewStatusLabel(item.preview.status)}
        />
        <InfoTile
          label="Upload Metadata Status"
          value={formatBrandingUploadMetadataStatusLabel(item.uploadMetadata)}
        />
        <InfoTile
          label="Content Type"
          value={trustedMetadata.contentType ?? "Nicht verfuegbar"}
        />
        <InfoTile
          label="File Extension"
          value={
            trustedMetadata.fileExtension?.toUpperCase() ?? "Nicht verfuegbar"
          }
        />
        <InfoTile
          label="File Size"
          value={formatBrandingFileSizeLabel(trustedMetadata.fileSizeBytes)}
        />
        <InfoTile
          label="Stored Filename"
          value={trustedMetadata.storedFilename ?? "Nicht verfuegbar"}
        />
        <InfoTile
          label="Created"
          value={formatBrandingDateTime(item.createdAt)}
        />
        <InfoTile
          label="Updated"
          value={formatBrandingDateTime(item.updatedAt)}
        />
        <InfoTile
          label="Platform"
          value={formatBrandingPlatformLabel(item.platform)}
        />
        <InfoTile
          label="Usage Context"
          value={item.usageContext ?? "Globales Brand Asset"}
        />
      </section>

      <section className="rounded-lg border border-dashed border-white/10 bg-surface-950/70 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
          Future Actions
        </p>
        <div className="mt-3 space-y-3">
          {item.futureActions.map((action) => (
            <div
              key={action.action}
              className="rounded-lg border border-white/10 bg-white/5 p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-white">
                  {formatBrandingFutureActionLabel(action.action)}
                </p>
                <span className="rounded-full border border-white/10 bg-surface-950/70 px-3 py-1 text-xs font-semibold text-slate-300">
                  blocked
                </span>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-400">
                {formatBrandingMutationReasonLabel(action.reason)}
              </p>
            </div>
          ))}
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-white">Orphan Cleanup</p>
              <span className="rounded-full border border-white/10 bg-surface-950/70 px-3 py-1 text-xs font-semibold text-slate-300">
                blocked
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-400">
              {formatBrandingMutationReasonLabel(
                "requires_scoped_manual_cleanup",
              )}
            </p>
          </div>
        </div>
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
      Diese Surface zeigt aktuell {model.feed.returnedCount} geladene Brand
      Assets aus dem neuesten Feed-Fenster mit Limit {model.feed.limit}. Weitere
      Assets sind vorhanden; Explorer-Filter und Sortierung decken den
      Gesamtbestand noch nicht vollstaendig ab.
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

function formatBrandingPreviewFilterLabel(
  value: (typeof BRANDING_DASHBOARD_PREVIEW_FILTERS)[number],
): string {
  switch (value) {
    case "all":
      return "Alle Preview-Zustaende";
    case "available":
      return "Preview verfuegbar";
    case "unavailable":
      return "Preview nicht verfuegbar";
  }
}

function formatBrandingMetadataFilterLabel(
  value: (typeof BRANDING_DASHBOARD_METADATA_FILTERS)[number],
): string {
  switch (value) {
    case "all":
      return "Alle Metadata-Zustaende";
    case "available":
      return "Metadata verfuegbar";
    case "invalid":
      return "Metadata ungueltig";
    case "unavailable":
      return "Metadata nicht verfuegbar";
  }
}

function buildBrandingViewHref(
  view: BrandingDashboardConsoleView,
  detailAssetId: string,
): string {
  const searchParams = new URLSearchParams();
  appendBrandingExplorerParams(searchParams, view);
  searchParams.set("asset", detailAssetId);

  const query = searchParams.toString();
  return query.length > 0
    ? `/dashboard/branding?${query}`
    : "/dashboard/branding";
}

function buildBrandingLoadMoreHref(view: BrandingDashboardConsoleView): string {
  if (!view.feed.nextCursor) {
    return view.detailAssetId
      ? buildBrandingViewHref(view, view.detailAssetId)
      : "/dashboard/branding";
  }

  const searchParams = new URLSearchParams();
  appendBrandingExplorerParams(searchParams, view);
  searchParams.set(
    "cursor",
    encodeBrandingDashboardCursorToken({
      cursor: view.feed.nextCursor,
      serverSort: view.feed.serverSort,
    }),
  );
  searchParams.set("window", String(view.feed.windowCount + 1));

  if (view.detailAssetId ?? view.selectedAsset?.id) {
    searchParams.set(
      "asset",
      view.detailAssetId ?? view.selectedAsset?.id ?? "",
    );
  }

  return `/dashboard/branding?${searchParams.toString()}`;
}

function appendBrandingExplorerParams(
  searchParams: URLSearchParams,
  view: BrandingDashboardConsoleView,
) {
  if (view.filters.assetType) {
    searchParams.set("assetType", view.filters.assetType);
  }

  if (view.filters.status) {
    searchParams.set("statusFilter", view.filters.status);
  }

  if (view.filters.preview !== "all") {
    searchParams.set("preview", view.filters.preview);
  }

  if (view.filters.metadata !== "all") {
    searchParams.set("metadata", view.filters.metadata);
  }

  if (view.sort !== "updated_desc") {
    searchParams.set("sort", view.sort);
  }

  if (view.feed.cursorToken) {
    searchParams.set("cursor", view.feed.cursorToken);
  }

  if (view.feed.windowCount > 1) {
    searchParams.set("window", String(view.feed.windowCount));
  }
}

function formatBrandingActiveFilterSummary(
  view: BrandingDashboardConsoleView,
): string {
  if (!view.feed.hasActiveFilters) {
    return "Aktive Explorer-Filter: keine";
  }

  const entries = [
    view.feed.activeFilters.assetType
      ? `Asset Type ${formatBrandingAssetTypeLabel(view.feed.activeFilters.assetType)}`
      : null,
    view.feed.activeFilters.status
      ? `Status ${formatBrandingAssetStatusLabel(view.feed.activeFilters.status)}`
      : null,
    view.feed.activeFilters.preview !== "all"
      ? `Preview ${formatBrandingPreviewFilterLabel(view.feed.activeFilters.preview)}`
      : null,
    view.feed.activeFilters.metadata !== "all"
      ? `Metadata ${formatBrandingMetadataFilterLabel(view.feed.activeFilters.metadata)}`
      : null,
  ].filter((entry): entry is string => entry !== null);

  return `Aktive Explorer-Filter: ${entries.join(", ")}`;
}
