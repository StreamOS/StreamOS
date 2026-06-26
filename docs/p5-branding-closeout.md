# P5 Branding Closeout

## 1. Gesamtstatus

`passed_with_warnings`

Der Branding MVP kann repo-seitig geschlossen werden. Die aktive Route
`/dashboard/branding` nutzt den aktuellen Read-/Preview-/Upload-/Explorer-
Contract, Delete/Replace/Orphan Cleanup bleiben deaktivierte Future-Contracts,
und die finalen Branding-Regressionen aus P5.10 sind ueber Types-, Data-,
Actions-, Page- und Utils-Tests abgesichert. P5.10 erweitert den Explorer um
serverseitige DB-basierte Filter-/Sort-Pagination; nur `preview` und
`metadata` bleiben bewusst clientseitige Fensterfilter.

Dieser Closeout ist reine Repo- und lokale Test-Evidence. Es wurden keine neuen
Mutationen, keine Storage-/Policy-/DB-Aenderungen, keine Deployments und keine
Secret-Aenderungen ausgefuehrt.

## 2. Repo-Status

- Branch: `codex/p5-5-branding-metadata-hardening`
- HEAD SHA: `9d218d274c14a3963253cab25ca4ee81830e17a8`
- Worktree clean vor Report-Aktualisierung: ja
- Report-Diff: nur diese Dokumentationsdatei
- Empfehlung: Branding MVP kann mit dokumentierten Warnings geschlossen werden

## 3. Scope-Abdeckung

### Read-only Dashboard

- Aktiver Dashboard-Pfad:
  `apps/web/src/app/dashboard/branding/page.tsx` -> `/dashboard/branding`
- Datenladung und State-Modell:
  `apps/web/src/app/dashboard/branding/data.ts`
- Haupt-UI:
  `apps/web/src/components/modules/BrandingDashboardConsole.tsx`
  `apps/web/src/components/modules/BrandingDashboardConsole.utils.ts`
- Gedeckte States:
  `disabled`, `unauthorized`, `auth-failed`, `load-failed`, `ready`,
  Partial-Lookup-Hinweise, echte Empty-States, Filter-Empty-State

### Private Preview

- Serverseitige Preview-Erzeugung:
  `apps/web/src/app/dashboard/branding/preview.ts`
- Kurzlebige Preview-Metadaten:
  `status`, `reason`, `expiresAt`, `url`
- Preview bleibt an tenant-scoped Storage und erlaubte Dateitypen gebunden

### Upload Runtime

- Server-owned Upload Action:
  `apps/web/src/app/dashboard/branding/actions.ts`
- Storage-/Form-Validierung:
  `apps/web/src/app/dashboard/branding/storage.ts`
- Upload bleibt create-only, ohne Replace/Delete-Semantik

### Upload Security Review

- Dateityp- und Extension-Allowlist fuer PNG/JPEG/WEBP
- SVG bleibt blockiert
- Dateisignaturen werden geprueft
- Dateinamen werden sanitisiert
- Storage-Pfade werden tenant-scoped gebaut
- alte irrefuehrende Upload-/Preview-/CRUD-Zukunftslogik bleibt nicht mehr als
  unmarkierter Parallelpfad unter `apps/web/src/app/dashboard/branding` liegen;
  aktiv bleiben nur `actions.ts`, `storage.ts`, `preview.ts`, `data.ts`,
  `page.tsx` und die zugehoerigen Tests

### Metadata Hardening

- `metadata.upload` wird typisiert gelesen
- Preview ist nur bei sicherer Metadata-/Path-Kombination verfuegbar
- Ungueltige Metadata blockiert Preview
- Fehlende Legacy-Metadata bleibt konservativ lesbar

### Disabled Mutation Contract

- Shared Contract:
  `packages/types/src/branding-dashboard.ts`
- UI-/Read-Model-Contract:
  `apps/web/src/components/modules/BrandingDashboardConsole.utils.ts`
- `replace`, `delete` und `orphan_cleanup` bleiben sichtbar, aber deaktiviert

### Explorer / Detail UX

- Filter, Sortierung und Detailpanel sind aktiv
- Detail-Fallback bleibt stabil, wenn das angeforderte Asset nicht im
  sichtbaren Feed liegt
- Explorer-Card-Highlight folgt dem tatsaechlich ausgewaehlten Detail-Asset
- Metadata, Preview und Future-Actions werden explizit angezeigt

### P5.10 Server-Side Filter / Sort Pagination

- serverseitige Filter: `assetType`, `status`
- serverseitige Sortierungen: `updated_desc`, `created_desc`, `asset_type`,
  `status`
- Cursor ist an `serverFilters` und `serverSort` gebunden
- ungueltige oder unpassende Cursor fallen sicher auf Fenster 1 zurueck
- `preview` und `metadata` bleiben bewusst clientseitige Fensterfilter

### Feed Scope / Cursor / Load More

- Feed-Contract mit `scope`, `hasMore`, `nextCursor`, `serverFilters`,
  `serverSort`
- SSR-`Mehr laden` ueber cursor-basiertes Feed-Fenster
- Cursor bleibt secret-safe, sortierungs- und filtergebunden
- Geladene Fenster werden kumulativ erweitert, ohne Duplikate

## 4. Aktive Datenquellen und Contracts

### Primare Datenquellen

- `brand_assets`
- privater Bucket `brand-assets`
- `storage_bucket`
- `storage_path`
- `metadata.upload`

### Aktive Contracts

- Preview metadata:
  `status`, `reason`, `expiresAt`, `url`
- Feed metadata:
  `limit`, `returnedCount`, `hasMore`, `scope`, `nextCursor`,
  `serverFilters`, `serverSort`
- Mutation future contract:
  `replace`, `delete`, `orphan_cleanup`

### Repo-Einordnung

- Table-/RLS-Basis:
  `packages/database/supabase/migrations/0007_brand_assets_monetization_events.sql`
- normalisierte RLS-Policies:
  `packages/database/supabase/migrations/0015_normalize_rls_auth_uid_predicates.sql`
- privater Storage-Bucket:
  `packages/database/supabase/migrations/20260622164807_brand_assets_private_storage.sql`

## 5. Security Closeout

- `public_url` bleibt im MVP deaktiviert; Upload schreibt weiterhin `null`
- signed preview URLs werden nicht persistiert
- Storage-Pfade werden nicht im UI ausgegeben
- keine Service-role im Browser oder in Client Components
- SVG bleibt blockiert
- Storage-Pfade bleiben tenant-scoped ueber `user_id`
- Preview-Signing validiert Bucket, Path und Tenant-Scope serverseitig
- Fehlerzustaende bleiben secret-safe und zeigen keine Rohpayloads
- Delete und Replace bleiben disabled
- Orphan Cleanup bleibt disabled und nicht global oder automatisch

## 6. UX Closeout

- Asset Explorer vorhanden und read-only
- Filter/Sortierung vorhanden
- Detailpanel vorhanden
- Metadata-Anzeige vorhanden
- Preview-Anzeige vorhanden
- Empty-/Load-Failed-/Auth-/Partial-States sind getrennt
- `Mehr laden` ist vorhanden, wenn `hasMore` und `nextCursor` vorliegen
- Sample-/loaded-window-Copy macht den begrenzten Feed-Scope explizit
- DB-basierte Filter und Sortierungen wirken serverseitig auf den Feed-Query
- nur `preview` und `metadata` bleiben fensterlokale Client-Filter

## 7. Test- und Contract-Evidence

- Shared Types:
  `packages/types/test/branding-dashboard.test.ts`
- Data Loader:
  `apps/web/src/app/dashboard/branding/data.test.ts`
- Upload Action:
  `apps/web/src/app/dashboard/branding/actions.test.ts`
- Route/UI:
  `apps/web/src/app/dashboard/branding/page.test.tsx`

Diese Tests decken insbesondere ab:

- read-only Contract und tolerante Unknown-Asset-Types
- Preview-Signing und Preview-Blockierung bei unsicherer Metadata
- fehlende `public_url`-Nutzung
- tenant-sichere Storage-Handhabung
- disabled Future-Actions
- Feed-Scope, `serverFilters`, `serverSort` und Cursor-Metadaten
- `Mehr laden`-UX und Cursor-Normalisierung
- fehlende Duplikate bei cursor-basierter Fenstererweiterung
- URL-getriebenen Filter-/Sort-State auch in Empty/Error/Auth-Modellen
- Explorer-Highlight fuer das tatsaechlich ausgewaehlte Detail-Asset

## 8. Validierung

Ausgefuehrte lokale Validierung:

- `pnpm --filter @streamos/types test` - passed
- `pnpm --filter @streamos/types build` - passed
- `pnpm --filter @streamos/web test` - passed, 35 Testdateien / 213 Tests
- `pnpm --filter @streamos/web build` - passed
- `coderabbit review --agent --base main -c AGENTS.md` - passed, `0 issues`

Optional nicht ausgefuehrt:

- `pnpm validate`

Begruendung:

- Der Closeout-Slice fuehrt nur eine Dokumentationsdatei ein.
- Die Produktcode-Validierung fuer den aktuellen P5.10-Stand ist bereits gruen.
- Fuer die reine Report-Datei war kein erneuter Build- oder Testlauf noetig.

## 9. Akzeptierte Restrisiken

- `accepted`
  Load More ist auf 5 Feed-Fenster begrenzt
- `accepted`
  `preview` und `metadata` wirken weiter nur auf das geladene Fenster
- `accepted`
  Delete/Replace/Orphan Cleanup bleiben reine Future-Contracts
- `accepted`
  Es gibt kein globales Orphan Cleanup
- `accepted`
  Es gibt keine vollstaendige Bild-Decoding-Validierung ueber die aktuelle
  Signaturpruefung hinaus
- `accepted`
  SVG-Sanitizing ist nicht Teil des MVP
- `accepted`
  Dieser Report enthaelt keine Production-/Storage-Live-Proofs

## 10. Empfohlene naechste Slices

1. Preview/Metadata Server-Queryable Fields Contract fuer vollstaendig
   serverseitige Explorer-Filterung
2. Brand Kit Structure Read Model fuer hoehere semantische Vollstaendigkeit im
   Dashboard

## 11. Schlussentscheidung

`P5 branding closeout: passed_with_warnings`

Der Branding-MVP-Umfang aus P5.1 bis P5.10 ist repo-seitig vorhanden,
architektonisch konsistent und lokal validierbar. Verbleibende Punkte sind
bewusst akzeptierte Produktgrenzen oder klar getrennte Follow-up-Slices, keine
Blocker fuer den Closeout.
