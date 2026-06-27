# P5 Branding Closeout

## 1. Gesamtstatus

`passed_with_warnings`

Der Branding MVP kann repo-seitig geschlossen werden. Die aktive Route
`/dashboard/branding` nutzt den aktuellen Read-/Preview-/Upload-/Explorer-
Contract, Delete/Replace/Orphan Cleanup bleiben deaktivierte Future-Contracts,
und die finalen Branding-Regressionen aus P5.10 sind ueber Types-, Data-,
Actions-, Page- und Utils-Tests abgesichert. P5.10 erweitert den Explorer um
serverseitige DB-basierte Filter-/Sort-Pagination. P5.11 bis P5.13 fuehren den
maschinenlesbaren Derived-Status-/Evidence-Gate ein. P5.14 aktiviert diesen
Gate jetzt kontrolliert: `preview` wird serverseitig ueber
`preview_capability_status` gefiltert, `metadata` serverseitig ueber
`upload_metadata_status`.

Dieser Closeout kombiniert Repo-/lokale Test-Evidence mit redacted
Hosted-Rollout- und Recheck-Evidence. Die Repo-Aenderungen selbst fuehren keine
neuen Storage-/Policy-Aenderungen oder Secret-Aenderungen ein; der bereits
dokumentierte Hosted-Migrationsrollout bleibt ein separater Operator-Schritt
und wird unten getrennt von read-only Evidence und lokaler Validierung
ausgewiesen.

## 2. Repo-Status

- Branch und HEAD-SHA: vor Sign-off lokal erfassen; dieser Report ist kein
  Commit-Marker
- Worktree clean vor finaler Freigabe: erforderlich
- Report-Diff: keine unrelated `docs/ai`-Aenderungen
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

### P5.10 und P5.14 Server-Side Filter / Sort Pagination

- serverseitige Filter: `assetType`, `status`, `preview`, `metadata`
- serverseitige Sortierungen: `updated_desc`, `created_desc`, `asset_type`,
  `status`
- Cursor ist an `serverFilters` und `serverSort` gebunden
- ungueltige oder unpassende Cursor fallen sicher auf Fenster 1 zurueck
- `preview` und `metadata` sind jetzt echte serverseitige Feed-Filter

### P5.11 Preview / Metadata Queryability Contract

- P5.11 hat den Bedarf fuer persistierte server-managed Statusfelder belegt
- der Explorer-Contract markiert Filter-Ownership maschinenlesbar als
  `server_query` vs. `client_window`
- P5.12 fuehrt diesen persistierten Follow-up-Contract jetzt als
  server-managed `upload_metadata_status`- und
  `preview_capability_status`-Spalten ein
- die Spalten werden datenbankseitig aus `metadata`, `storage_bucket`,
  `storage_path` und `user_id` abgeleitet und nicht vom App-Insert vertraut
- historische `brand_assets` werden dadurch beim Migrations-Rollout implizit
  backfilled; `signing_failed` bleibt ein rein transientes Preview-Ergebnis
- P5.13 ergaenzt tenant-scoped Query-Indizes und einen maschinenlesbaren
  Feed-Gate, der die spaetere Server-Filter-Aktivierung weiter explizit blockt
- P5.13.1 ergaenzt einen read-only Hosted-Evidence-Check und eine explizite
  Freigabematrix fuer P5.14: Repo-Contract bereit, Hosted-Migrations- und
  Index-Evidence aber weiterhin separat nachzuweisen
- P5.14 schaltet nach gruenem Hosted-Evidence-Run beide Filter kontrolliert auf
  `server_query`

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
- `upload_metadata_status`
- `preview_capability_status`

### Aktive Contracts

- Preview metadata:
  `status`, `reason`, `expiresAt`, `url`
- Feed metadata:
  `limit`, `returnedCount`, `hasMore`, `scope`, `nextCursor`,
  `serverFilters`, `serverSort`, `derivedStatusQueryGate`
- Mutation future contract:
  `replace`, `delete`, `orphan_cleanup`

### Repo-Einordnung

- Table-/RLS-Basis:
  `packages/database/supabase/migrations/0007_brand_assets_monetization_events.sql`
- normalisierte RLS-Policies:
  `packages/database/supabase/migrations/0015_normalize_rls_auth_uid_predicates.sql`
- privater Storage-Bucket:
  `packages/database/supabase/migrations/20260622164807_brand_assets_private_storage.sql`
- Derived-Status-Persistenz:
  `packages/database/supabase/migrations/20260627120000_brand_assets_derived_status_contract.sql`
- Derived-Status-Query-Indizes:
  `packages/database/supabase/migrations/20260627133000_brand_assets_derived_status_query_indexes.sql`

### P5.14 Freigabematrix

| Gate                   | Repo-Status | Hosted-Evidence    | Bedeutung                                                                           |
| ---------------------- | ----------- | ------------------ | ----------------------------------------------------------------------------------- |
| `repoReady`            | `true`      | nicht erforderlich | Shared-Type, Read-Model und Migrations-Slices liegen im Repo vor                    |
| `hostedMigrationReady` | `true`      | erbracht           | Zielumgebung enthaelt beide Derived-Status-Spalten, Constraints und Generated-Logic |
| `hostedIndexReady`     | `true`      | erbracht           | Zielumgebung enthaelt beide tenant-scoped Query-Indizes                             |
| `serverFilterReady`    | `true`      | in P5.14 aktiviert | `preview` und `metadata` sind auf echte serverseitige Feed-Filter umgestellt        |

Repo-seitiger Hosted-Check:

```bash
pnpm db:branding-evidence -- --env-file .env --target-environment production --format text
```

Fallback ohne `psql`:

```bash
pnpm db:branding-evidence -- --print-sql
```

P5.14 durfte erst nach gruenem Hosted-Evidence-Run starten. Dieser Slice
stellt den Feed-Gate jetzt bewusst auf aktiv um.

Der read-only Hosted-Evidence-Check verlangt seit dem Recheck vom
`2026-06-27` ausserdem eine eindeutige Zielumgebungsbindung. Wenn
`SUPABASE_DB_URL` die Zielumgebung nicht selbst beweist, muss der Run explizit
mit `--target-environment <local|development|staging|production>` gebunden
werden. Der Check verifiziert ausserdem den aktiven P5.14-Web-Read-Path
fail-closed gegen die repo-seitige Derived-Status-Gate-Aktivierung.

### Redacted Hosted-Evidence-Stand

- letzter repo-seitiger Evidence-Versuch:
  read-only Recheck ueber den SQL-Fallback mit derselben
  `SUPABASE_DB_URL`-Zielumgebung
- Ergebnis: `passed`
- redacted Befund:
  die Zielumgebungs-Verbindung ueber `SUPABASE_DB_URL` war vorhanden und der
  finale Hosted-Recheck war fuer Migrationen und Indizes gruen
- keine DB-URL, keine Tokens, keine Secrets und keine privaten Hostnames wurden
  ausgegeben oder in diesen Report uebernommen
- Folge:
  `hostedMigrationReady` und `hostedIndexReady` sind jetzt mit echtem
  Zielumgebungs-Report explizit `passed`; P5.14 aktiviert darauf aufbauend
  `serverFilterReady` repo-seitig auf `true`
- manueller Fallback fuer Operatoren:
  `pnpm db:branding-evidence -- --print-sql`

### P5.13.2 Rollout- und Recheck-Runbook

- Zielumgebung geprueft:
  ja; die lokale Zielkonfiguration war intern konsistent, weil
  `SUPABASE_DB_URL` und die vorhandene Supabase-Web-URL auf dasselbe Hosted
  Projekt zeigten
- wichtiger Zusatz:
  das Repo pinnt keinen kanonischen Hosted-Project-Ref; die Aussage
  "richtige Zielumgebung" stuetzt sich deshalb auf den konsistenten lokalen
  Env-Abgleich plus die reale Hosted-Migrationshistorie
- redacted Hosted-Migrationshistorie:
  `public.brand_assets` existiert; nach dem erfolgreichen Re-Rollout sind die
  Branding-Versionen `20260627120000` und `20260627133000` in der
  Zielumgebung sichtbar
- Drift-Befund:
  der urspruengliche Blocker in `20260625161515` wurde repo-seitig behoben;
  danach konnte die verbleibende Kette bis einschliesslich der Branding-
  Migrationen erfolgreich ausgerollt werden
- Interpretation:
  die Zielumgebung war zunaechst veraltet und dann durch einen
  Metrics-Snapshots-Kompatibilitaetsblocker aufgehalten; dieser Pfad ist jetzt
  fuer den Branding-Slice ausgeraeumt
- exakter Rollout-Blocker:
  `20260625161515_p4_creator_growth_intelligence_contract.sql` kann in der
  Zielumgebung keine Foreign-Key-Referenz auf
  `public.metrics_snapshots(id, user_id)` anlegen, weil dort keine passende
  `UNIQUE`- oder `PRIMARY KEY`-Constraint existiert
- repo-seitige Folge:
  fuer diesen Blocker wurde ein migrationssicherer Kompatibilitaets-Fix im
  P5.13.3-Slice umgesetzt; der Hosted-Rollout und der Branding-Evidence-
  Recheck wurden danach erfolgreich erneut ausgefuehrt
- Operator-Gate fuer den Rollout:
  der kontrollierte Re-Rollout hat die verbleibenden Pending-Migrationen bis
  `20260627133000_brand_assets_derived_status_query_indexes.sql`
  erfolgreich angewendet
- Recheck nach Operator-Rollout:
  1. bevorzugt
     `pnpm db:branding-evidence -- --env-file .env --format text`
  2. falls im Operator-Runtime kein `psql` vorhanden ist:
     `pnpm db:branding-evidence -- --print-sql`
     und danach dieselbe read-only SQL via
     `supabase db query --db-url <redacted> --file <sql-file> --output json`
  3. in den Report duerfen nur redacted Status, Versionsnummern und Findings
     uebernommen werden; keine DB-URL, keine Tokens, keine Secrets und keine
     privaten Hostnames
- P5.14-Freigabe:
  ist aus Hosted-Migrationssicht jetzt vorbereitet, weil
  `hostedMigrationReady = passed` und `hostedIndexReady = passed` vorliegen;
  die Aktivierung ist in diesem Slice erfolgt

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
- `preview` mappt global auf `preview_capability_status`
- `metadata` mappt global auf `upload_metadata_status`
- die UI beschreibt `preview` und `metadata` nicht mehr als Fensterfilter

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
- den fail-closed Shared-Gate-Default und die explizite P5.14-Aktivierung im
  Web-Slice
- maschinenlesbare Filter-Ownership fuer `assetType`, `status`, `preview` und
  `metadata`
- `Mehr laden`-UX und Cursor-Normalisierung
- fehlende Duplikate bei cursor-basierter Fenstererweiterung
- URL-getriebenen Filter-/Sort-State auch in Empty/Error/Auth-Modellen
- Explorer-Highlight fuer das tatsaechlich ausgewaehlte Detail-Asset

## 8. Rollout, Evidence und Validierung

### Operator-Rollout (mutierend, nicht read-only)

- `supabase db push --db-url <redacted> --include-all --yes --workdir .` -
  passed, die verbleibenden Pending-Migrationen bis einschliesslich
  `20260627133000_brand_assets_derived_status_query_indexes.sql` wurden
  erfolgreich angewendet

### Read-only Hosted Evidence

- `pnpm db:branding-evidence -- --env-file .env --format text` - lokal im
  Workspace weiter `blocked`, weil `psql` hier fehlt; der read-only
  Hosted-Recheck selbst wurde anschliessend ueber den dokumentierten
  SQL-Fallback gegen dieselbe Zielumgebung ausgefuehrt
- read-only Hosted-Migrationsaudit ueber `supabase db query` - passed,
  Branding-Versionen, Derived-Status-Spalten, Constraints, Funktionen und
  Query-Indizes sind in der Zielumgebung vorhanden

### Lokale Repo-Validierung

- `pnpm --filter @streamos/types test` - passed
- `pnpm --filter @streamos/types build` - passed
- `pnpm db:validate-security` - passed
- `node --test scripts/branding-hosted-evidence.test.cjs` - passed
- `pnpm test:railway-audit` - passed
- `pnpm --filter @streamos/web test` - passed, 35 Testdateien / 217 Tests
- `pnpm --filter @streamos/web build` - passed
- `pnpm validate` - passed
- `coderabbit review --agent --base main -c AGENTS.md` - passed, `0 issues`

## 9. Akzeptierte Restrisiken

- `accepted`
  Load More ist auf 5 Feed-Fenster begrenzt
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

1. Brand Kit Structure Read Model fuer hoehere semantische Vollstaendigkeit im
   Dashboard

## 11. Schlussentscheidung

`P5 branding closeout: passed_with_warnings`

Der Branding-MVP-Umfang aus P5.1 bis P5.10 ist repo-seitig vorhanden,
architektonisch konsistent und lokal validierbar. Verbleibende Punkte sind
bewusst akzeptierte Produktgrenzen oder klar getrennte Follow-up-Slices, keine
Blocker fuer den Closeout.
