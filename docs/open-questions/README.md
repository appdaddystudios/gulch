# Open Questions — Kickoff

Items that hit a **STOP-AND-ASK** trigger (ambiguous mapping / missing input / needs a decision). Resolved gates from the kickoff Q&A are recorded at the bottom. None block writing the plan; #1, #2, #4, #8 should be answered before/at execution start.

## Needs your input
1. **Geocoding region bias (ambiguous geocode input).** Webflow addresses are partial — e.g. `"10 Krog St NE"` with no city/state. I plan to bias Mapbox to **metro Atlanta** (proximity + bbox). **Confirm all Locations are Atlanta-area.** If multi-city, we need a city/region field per item or the geocode will mis-resolve.
2. **`MAPBOX_TOKEN`.** Please add a server-only Mapbox token to root `.env`. Pipeline + edge functions read it from env (never hardcoded).
3. **Data scope — `artcalatl.com`.** The single Webflow site "Gulch" also serves `artcalatl.com`. No field currently distinguishes Gulch vs ArtCal items in Locations/Events/Shows. **Are all CMS items in-scope for the Gulch app**, or must we filter? If filter, on what signal?
4. **Webhook scope.** Brief specifies `item created` only. Confirm we **defer updates/deletes to the daily refresh tick** (vs also registering `collection_item_changed` / `deleted` webhooks now).
5. **Deletes handling.** When a Webflow item disappears, prefer **soft-delete** (mark removed, keep row for audit/lineup integrity) over hard-delete? (Recommend soft.)
6. **v1 event modeling.** Keep `events` and `shows-ongoing-events` as **two separate Supabase tables** in v1 (faithful mirror), unifying only in v-next? (Recommended — matches KISS.)
7. **EAS / store credentials.** Not needed to scaffold, but EAS Build later needs an Expo account + Apple/Google store creds. Out of kickoff scope — flagging for v1 build time.
8. **Supabase extensions.** OK to enable `postgis`, `pg_cron`, `pg_net` on the provisioned project? (Reversible; `pg_cron`/`pg_net` are required for the refresh tick to invoke the edge function.)

## Assumptions I'm proceeding on (correct me if wrong)
- Supabase **Auth** = the eventual user system (v5); RLS designed in from v1 (public read, service_role write).
- Refresh tick cadence: **daily 06:00 ET** (configurable).
- pnpm at root; admin keeps appdaddystudios parity under pnpm.
- Planning/markdown docs authored by Claude Code directly; **all code/tests/commands via `codeagent`**.

## Resolved gates (2026-06-29)
- Geocoding provider → **Mapbox** (storage-terms + cost; Google ToS forbids persisting coords off-map).
- Package manager → **pnpm workspace** (Expo/EAS reliability over Bun parity).
- Pipeline runtime → **hybrid** (Edge Functions for webhook + refresh tick; Node/TS CLI for seed + geocode).
- Expo SDK → **56** confirmed real & latest (56.0.12; 57 is preview).
