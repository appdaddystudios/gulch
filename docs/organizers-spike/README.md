# Organizers Spike — Requirements Specification

**Status:** ✅ Requirements discovery complete (2026-06-29). Live Webflow schema re-pulled and reconciled; all open questions resolved. Brainstorm output only — no implementation. Next: `/sc:design`.
**Source of truth:** Webflow CMS API v2 (`GULCH_WEBFLOW_API_KEY`). Supersedes the 3-junction-collection model the client first tried then abandoned ("joining too complicated for Webflow").

## Goal

Mirror the new **Organizers** entity into Supabase and derive its relationships to **events** and **locations**, so the app can power the v1 mobile "Featured Organizations" section and show organizers on events. All relationships are **Webflow-derived** (direct references) — no admin curation, no geocoding.

## Live Webflow schema (verified, organizer-relevant only)

| Collection | id | Organizer-relevant fields | Data |
|---|---|---|---|
| **organizer** | `6a430e64b51f80db57a22b3c` | `name`✅, `slug`✅, `website-url`, `instagram-url`, `facebook-url`, `is-featured` (Switch), `custom-color` (Color hex) | **195 items** |
| **events** | `6845d39c294d60e4c197cee9` | + **`additional-organizers`** (MultiReference → organizer, optional) | field exists, 0 populated yet |
| **locations** | `6843bee91e942f36fd3adc06` | + **`is-organizer`** (Switch), + **`managing-organizer`** (single Reference → organizer, optional) | fields exist |
| shows-ongoing-events | `6865fb691dda49a9c7043754` | *(none)* | — |

Collections that were **removed** by the client (do NOT model them): `event-organizer`, `location-managing-organizer` junction collections. The join now lives in the source collections as references, and the relational transform happens on our side.

## Relationship transforms (our side)

1. **event ↔ organizers (M:N):** explode `events.additional-organizers` (array of organizer ids) into normalized `(event_id, organizer_id)` rows. → junction needed.
2. **location → managing organizer (N:1):** `locations.managing-organizer` is a single organizer id → a nullable FK on the location. One location ≤ 1 managing org; one org manages many locations. → no junction.
3. **`locations.is-organizer` (boolean):** distinct from `managing-organizer`. Flags "this venue is itself an organizer entity" (e.g. High Museum exists as both a location and an organizer record). Capture the flag; it is NOT the relationship link.

## Functional requirements

- **FR1 — organizers mirror:** new `organizers` table from the `organizer` collection (195 rows). Fields: name, slug, website/instagram/facebook url, `is_featured`, `custom_color`. **No geocoding** (organizers have no address).
- **FR2 — capture new locations fields:** stop silently stripping additive CMS fields on locations; persist `is_organizer` and the `managing-organizer` reference. (Current `locationFieldDataSchema` is a closed `z.object` → these are dropped today.)
- **FR3 — event_organizers (M:N):** derive `(event_id, organizer_id)` rows by exploding `events.additional-organizers`. Pipeline-derived; idempotent.
- **FR4 — managing organizer (N:1):** capture `locations.managing-organizer` → organizer link.
- **FR5 — pipeline coverage:** seed + webhook + refresh-tick handle the `organizer` collection and re-derive relationships on each run. Wire the new collection id into `WEBFLOW_COLLECTION_IDS` (pipeline), `COLLECTIONS` + `TABLE_BY_COLLECTION_ID` (edge `_shared/schemas`), and `ORDER` (refresh-tick). Webhook `collection_item_created` for organizers + re-handle events/locations updates that change references.
- **FR6 — UI enablement:** `organizers.is_featured` powers the v1 mobile "Featured Organizations" Home section.

## Non-functional requirements

- **RLS:** anon + authenticated `select` on all new tables/columns; writes service-role only (mirrors existing locations/events/shows policy). No admin-write path required — everything is Webflow-derived.
- **FK / ordering:** seed organizers + locations before events before relationship rows; references `on delete set null`/cascade per design phase.
- **Additive & non-destructive:** no impact on existing locations/events/shows rows; new columns nullable; re-runnable upserts (`onConflict: webflow_item_id`).
- **Empty-data tolerance:** `additional-organizers` is unpopulated today — transforms must produce 0 rows cleanly and backfill automatically once content is tagged.
- **Testing:** TDD ≥90% per existing package gates (`packages/{db,shared,pipeline}` + edge `functions/tests`); fixtures covering populated, empty, and multi-organizer events.
- **Infra hygiene:** hand-authored `packages/db/src/types.ts` must be extended to match the new migration; guard against the stray `bun.lock` / dropped `turbo` gotcha on commit.

## Impact map (files touched in a later phase)

- `supabase/migrations/` — new migration: `organizers` table + RLS/grants/trigger, locations new columns, `event_organizers` junction.
- `packages/db/src/types.ts` — extend Database type (hand-authored mirror).
- `packages/shared/src/{webflow-schemas,mappers}.ts` — organizer schema+mapper; locations schema gains `is-organizer` + `managing-organizer`; event mapper exposes `additional-organizers`.
- `packages/pipeline/src/{webflow-client,seed}.ts` — collection id + seed orchestration + relationship explode.
- `supabase/functions/_shared/{schemas,mappers,reconcile}.ts`, `webflow-webhook/index.ts`, `refresh-tick/index.ts` — Deno mirrors.

## Open questions

None blocking. Design-phase decisions (defer to `/sc:design`): junction-table vs FK-column for managing organizer (recommend FK column, N:1); cascade behavior on organizer/event/location deletes; whether `event_organizers` re-derivation diffs or full-replaces per event on webhook.

## First-principles takeaways

1. **References, not junction collections.** Webflow can't manage relational junctions in its CMS UI, but it *can* store references on the owning item. So the M:N and N:1 links live as a multi-ref (`events.additional-organizers`) and a single-ref (`locations.managing-organizer`); our pipeline does the relational normalization.
2. **Cardinality dictates shape.** Multi-ref → junction table; single-ref → FK column. Don't model the managing relationship as a junction just because the client first described a "table."
3. **`is_organizer` ≠ `managing_organizer`.** A boolean self-flag vs an actual organizer link — both captured, different meanings.
4. **No new external dependencies.** No geocoding, no new secrets, no new auth path — purely additive mirror + transform.
