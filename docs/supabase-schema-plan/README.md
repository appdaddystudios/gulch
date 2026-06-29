# Supabase Schema Plan

Maps the discovered Webflow CMS (see `../webflow-schema-discovery/`) into Supabase in two stages:
**v1 = faithful mirror** (KISS, ship data fast) and **v-next = normalized/granular** (forward-compatible, spatial-ready). DB is **Supabase Cloud, already provisioned** — do not recreate the project.

Guiding rules: KISS/YAGNI for v1, never-break-userspace for the v1→v-next path, validate all Webflow input at the boundary (zod), immutable upserts keyed on the Webflow item id.

---

## v1 — faithful mirror (3 tables)

Natural key = Webflow item id (`webflow_item_id`), so seed + refresh + webhook all converge on idempotent `UPSERT ... ON CONFLICT (webflow_item_id)`.

### `public.locations`
| Column | Type | Notes |
|---|---|---|
| `webflow_item_id` | `text PRIMARY KEY` | Webflow id |
| `name` | `text NOT NULL` | |
| `slug` | `text NOT NULL UNIQUE` | |
| `name_address` | `text` | from `plain-text-name-address` |
| `google_maps_url` | `text` | passthrough |
| `neighborhood` | `text` | |
| `parking` | `text` | |
| `hide_from_list` | `boolean NOT NULL DEFAULT false` | |
| **`latitude`** | `double precision` | ← **geocode insertion point** |
| **`longitude`** | `double precision` | ← **geocode insertion point** |
| `geocode_status` | `text NOT NULL DEFAULT 'pending'` | `pending`\|`ok`\|`failed`\|`manual` |
| `geocoded_at` | `timestamptz` | |
| `webflow_last_updated` | `timestamptz` | for refresh diffing |
| `created_at` / `updated_at` | `timestamptz DEFAULT now()` | |

### `public.events`
| Column | Type | Notes |
|---|---|---|
| `webflow_item_id` | `text PRIMARY KEY` | |
| `name` | `text NOT NULL` | |
| `slug` | `text NOT NULL` | |
| `start_at` | `timestamptz NOT NULL` | from `start-date-time` |
| `end_at` | `timestamptz` | |
| `custom_time_description` | `text` | |
| `location_id` | `text REFERENCES locations(webflow_item_id)` | nullable (Webflow allows missing ref) |
| `external_link` | `text NOT NULL` | |
| `tickets_required` | `boolean NOT NULL DEFAULT false` | |
| `webflow_last_updated` / `created_at` / `updated_at` | `timestamptz` | |

### `public.shows`  (← `shows-ongoing-events`)
Same shape as `events` minus `tickets_required`/`custom_time_description`; `start_date`/`end_date` nullable; `location_id` FK→locations. Kept as a **separate table in v1** (faithful); unified in v-next (open question #3).

### RLS (v1)
- Enable RLS on all three. Data is **public event listings** → `anon`/`authenticated` get `SELECT` only; `service_role` (pipeline) gets full CRUD. No PII in these tables.

### Geocoding insertion point
Geocoding happens **in the pipeline, between Webflow fetch and Supabase upsert** — never inside the DB:
```
Webflow item → zod validate → if location & address changed → Mapbox forward-geocode
   (Atlanta proximity+bbox bias) → set latitude/longitude/geocode_status → UPSERT
```
A pending/failed `geocode_status` lets the admin retry or set coords manually (`manual`) without a re-seed.

---

## v-next — normalized, granular, spatial (forward-compatible target)

Rationale (first-principles, driven by the roadmap): v2 needs **maps + heatmaps** (PostGIS), v4 needs **organizations**, and the mobile calendar/lineup must treat events + ongoing shows uniformly.

- **Enable `postgis`.** `locations.geom geography(Point,4326)` + GIST index → proximity & heatmap queries. (lat/long retained for convenience.)
- **`neighborhoods`** table; `locations.neighborhood_id` FK (replaces free-text). Structured address: `address_line`, `city`, `region`, `postal_code`, `country`.
- **Unified `events`** with `event_kind` enum (`event` | `ongoing_show`); merges `events` + `shows`. Legacy reads preserved via `events_v1` / `shows` **views** during transition.
- **`organizations`** + `event_organizers` join (roadmap v4) — placeholder now, not in Webflow yet.
- **`event_links`** (1-event→N links: instagram/tickets/etc.) replacing single `external_link`.
- **`geocode_cache`** keyed by `sha256(normalized_address)` → avoids re-geocoding unchanged addresses on every refresh tick (cost + Mapbox rate-limit win; content-hash pattern).
- **`sync_audit`** (source, item id, action, at) for observability of refresh/webhook runs.

### Migration path (additive, never-break)
1. `CREATE EXTENSION postgis;` add new tables (`neighborhoods`, `organizations`, `geocode_cache`, `sync_audit`) + new columns **additively** — no drops.
2. Backfill `geom` from existing `latitude/longitude` (`ST_MakePoint`); backfill structured address via parse + re-geocode pass.
3. Introduce unified `events` as a new table; copy `events`+`shows` into it; expose old shapes as **views** so existing readers keep working.
4. Flip readers to the new tables/views; only then drop legacy tables.

Each step is its own migration + PR; readers never see a breaking change mid-flight.

---

## Webflow → Supabase field map (v1)

| Webflow (locations) | Supabase | | Webflow (events) | Supabase |
|---|---|---|---|---|
| id | `webflow_item_id` | | id | `webflow_item_id` |
| name | `name` | | name | `name` |
| slug | `slug` | | slug | `slug` |
| plain-text-name-address | `name_address` (→geocode) | | start-date-time | `start_at` |
| google-maps-link-url | `google_maps_url` | | end-date-time | `end_at` |
| neighborhood-optional | `neighborhood` | | custom-time-description | `custom_time_description` |
| parking-optional | `parking` | | location | `location_id` (FK) |
| hide-from-locations-list | `hide_from_list` | | external-link | `external_link` |
| (geocoded) | `latitude`,`longitude`,`geocode_status` | | show-tickets-required-tag | `tickets_required` |

`shows-ongoing-events` maps the same way into `public.shows`.
