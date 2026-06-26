# P4 Product Docs / Roadmap Update

## 1. Status

P4 ist produktseitig fuer die aktiven Dashboard-Surfaces Growth, Analytics und
Monetization abgeschlossen. Die technische Evidence und die akzeptierten
Grenzen sind im Closeout dokumentiert:

- [P4 Product Closeout](./p4-product-closeout.md)

Dieser Roadmap-Stand ist absichtlich produktnah. Er beschreibt aktive
Creator-Surfaces, akzeptierte MVP-Grenzen und die naechsten priorisierten
Slices, ohne neue Architektur einzufuehren.

## 2. Aktive P4-Surfaces

### Growth / SEO Intelligence

- Route: `/dashboard/growth`
- Surface:
  review-first Creator-Growth-Intelligence mit tenant-scoped Read Model
- Contract:
  `packages/types/src/creator-growth.ts`
- Aktiver Scope:
  gespeicherte SEO-, Metadaten-, Publish-Timing-, Plattform-Fit- und
  Engagement-Signale mit Coverage- und Feed-Metadaten
- Akzeptierte Grenze:
  sample-scoped Feed ohne Pagination-UI, keine Browser-AI-Generation

### Analytics Expansion

- Route: `/dashboard/analytics`
- Surface:
  read-only Content-Performance-Join ueber Publications, Scheduling-Kontexte
  und Metrics Snapshots
- Contract:
  `packages/types/src/content-performance-analytics.ts`
- Aktiver Scope:
  Plattformvergleich, linked/publication_only/metrics_only-Semantik,
  explizite Availability fuer fehlende Metriken
- Akzeptierte Grenze:
  nur vorhandene Metrics, keine neue Provider-Ingestion

### Monetization Dashboard

- Route: `/dashboard/monetization`
- Surface:
  read-only Revenue-, Trend-, Breakdown- und Recent-Events-Surface mit
  Coverage- und Data-Quality-Hinweisen
- Contract:
  `packages/types/src/monetization-dashboard.ts`
- Aktiver Scope:
  `monetization_events`, `monetization_summaries`,
  `get_monetization_dashboard`, `revenue_by_source`, kanonische
  Source-Taxonomy, mobile/desktop-erreichbare Navigation
- Akzeptierte Grenze:
  Taxonomie und Warnings bleiben heuristisch; keine echten
  Payment-/Provider-Syncs oder Write-Flows im MVP

## 3. Produktentscheidung Nach P4

- Growth, Analytics und Monetization bleiben aktive read-first Dashboard-Module
- Produktdocs sollen ab jetzt von den aktiven Dashboard-Routen und
  Read-Model-Contracts ausgehen, nicht mehr von geplanten Platzhaltern
- Monetization ist kein "zukuenftiger" Workflow mehr, sondern eine aktive
  Creator-Surface mit bewusst begrenzter Data-Quality-Semantik
- Analytics ist als Content-Performance-Surface aktiv; Publishing Analytics
  bleibt ein benachbartes Publication-Surface unter
  `/dashboard/publications/analytics`

## 4. Priorisierte Naechste Slices

1. Creator Growth -> Monetization Insight Link
2. Monetization Coverage / Provenance Hardening vor echten Sync-Slices
3. Branding MVP / Brand Assets Read-First

## 5. Nicht Priorisieren Im Direkten Anschluss

- keine neuen Payment-/Provider-Writes aus dem Browser
- keine Monetization-Syncs ohne serverseitige Provenance-/Coverage-Haertung
- keine neue Analytics-Ingestion nur fuer UI-Vollstaendigkeit
- kein Growth-Refactor ohne klaren Schritt von Read-First zu
  server-owned Recommendation-Generation
