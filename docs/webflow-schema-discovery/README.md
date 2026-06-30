# Webflow Schema Discovery

**Status:** ✅ Discovery run live (read-only) on 2026-06-29. Token reachable, schema captured.
**Source of truth:** Webflow CMS API v2. Auth: `GULCH_WEBFLOW_API_KEY` (in root `.env`, server-only, never printed/committed).

## Connection plan

- **Base:** `https://api.webflow.com/v2`
- **Auth header:** `Authorization: Bearer <GULCH_WEBFLOW_API_KEY>` (read from env at runtime).
- **Token validated:** `GET /token/authorized_by` → 200 (owner: Jasmine Hentschel).
- **Site:** `GET /sites` → one site **"Gulch"**, id `684345d2fa9a950b8116b072`.
  - Custom domains: `gulchmagazine.com`, `www.gulchmagazine.com`, `artcalatl.com`, `www.artcalatl.com` — **one Webflow site serves two public domains** (see open question on data scope).
  - Timezone: `America/New_York`.
- **Rate/paging constraint (bedrock):** Webflow v2 list endpoints return **max 100 items/page** via `offset`/`limit`. Seed + refresh MUST paginate.

## Discovered collections (3)

`GET /sites/{site_id}/collections` → 3 collections. Field detail via `GET /collections/{id}`.

### `locations` — id `6843bee91e942f36fd3adc06` — 616 items
| Field slug | Type | Required | Notes |
|---|---|---|---|
| `name` | PlainText | ✅ | Display name |
| `slug` | PlainText | ✅ | URL slug |
| `plain-text-name-address` | PlainText | – | **Geocode source.** Partial address, e.g. `"Tim Barrett Designs Inc., 10 Krog St NE"` — no city/state/zip |
| `google-maps-link-url` | Link | – | `maps.app.goo.gl` shortlink — NOT directly coord-parseable |
| `neighborhood-optional` | PlainText | – | Often null |
| `parking-optional` | PlainText | – | Often null |
| `hide-from-locations-list` | Switch | – | Visibility flag |

### `events` — id `6845d39c294d60e4c197cee9` — 1042 items
| Field slug | Type | Required | Notes |
|---|---|---|---|
| `name` | PlainText | ✅ | |
| `slug` | PlainText | ✅ | |
| `start-date-time` | DateTime | ✅ | ISO 8601 UTC |
| `end-date-time` | DateTime | – | |
| `custom-time-description` | PlainText | – | Free-text time override |
| `location` | Reference → `locations` | – | Webflow item id, e.g. `6843c04de2917a964a3448f1` |
| `external-link` | Link | ✅ | Often Instagram |
| `show-tickets-required-tag` | Switch | – | |
| `additional-organizers` | MultiReference → `organizers` | – | "Event Organizer(s)". **Re-pull 2026-06-30:** present in schema but empty for every live item (0 links across 1029 events) → cards fall back to the venue name |
| `is-editor-s-pick` | Switch | – | "Is Editor's Pick". **Added by Webflow team; discovered 2026-06-30.** 0 events marked `true` at discovery. Mapped to `events.editors_pick` (default false); propagates via webhook/refresh-tick |

### `shows-ongoing-events` — id `6865fb691dda49a9c7043754`
| Field slug | Type | Required | Notes |
|---|---|---|---|
| `name` | PlainText | ✅ | |
| `slug` | PlainText | ✅ | |
| `start-date` | DateTime | – | |
| `end-date` | DateTime | – | |
| `location` | Reference → `locations` | – | |
| `external-link` | Link | – | |

## Webhooks

`GET /sites/{site_id}/webhooks` → `[]` (none exist). Creating a `collection_item_created` webhook later is **additive, non-destructive**.

## Item shape (verified sample)

```json
// locations item.fieldData
{ "name": "Tim Barrett Designs Inc.",
  "plain-text-name-address": "Tim Barrett Designs Inc., 10 Krog St NE",
  "google-maps-link-url": "https://maps.app.goo.gl/8qqZukTk69uWsWkX9",
  "hide-from-locations-list": false, "slug": "tim-barrett-designs-inc" }
// events item.fieldData
{ "name": "\"Metro Montage XXVI\" Group Exhibition Opening",
  "start-date-time": "2026-07-11T22:00:00.000Z", "end-date-time": "2026-07-12T00:00:00.000Z",
  "location": "6843c04de2917a964a3448f1",
  "external-link": "https://www.instagram.com/p/DY0skldEat4/", "show-tickets-required-tag": false }
```

## First-principles takeaways (feed the pipeline design)

1. **Addresses are partial** → forward-geocoding needs an **Atlanta region bias** (proximity + bbox), not raw string lookup. See open question #1.
2. **Reference integrity:** events/shows point at location item ids → seed locations **before** events (FK order).
3. **Pagination is mandatory** (616 + 1042 items at 100/page).
4. **`google-maps-link-url` is a shortlink** → unreliable coord source; geocode the address string, keep the link only as a passthrough/fallback.
