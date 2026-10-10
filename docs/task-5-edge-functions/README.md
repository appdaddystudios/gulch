# Task 5 Edge Functions Rollout Runbook

This is a gated rollout checklist for later. Do not run these steps until the Supabase Edge Functions are ready to deploy and the real production values are available.

Custom function secrets must not start with `SUPABASE_`. Supabase injects `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` automatically.

## 1. Set Function Secrets

```sh
supabase secrets set \
  GULCH_WEBFLOW_API_KEY=... \
  MAPBOX_TOKEN=... \
  GULCH_WEBHOOK_SECRET=... \
  GULCH_REFRESH_SECRET=...
```

Optional, only if Webflow webhook HMAC signing is enabled:

```sh
supabase secrets set GULCH_WEBFLOW_SIGNING_SECRET=...
```

## 2. Deploy Functions

```sh
supabase functions deploy webflow-webhook refresh-tick
```

## 3. Schedule Refresh Tick

Enable `pg_cron` and `pg_net`, then run [schedule.sql](../../supabase/functions/refresh-tick/schedule.sql) manually after replacing:

- `<PROJECT_FUNCTION_URL>` with the real Supabase project URL.
- `<GULCH_REFRESH_SECRET_FROM_VAULT_OR_ROLLOUT_SECRET>` with a vault/secret reference or rollout-safe value.

The schedule posts daily at 10:00 UTC, which is 06:00 ET during daylight time.

## 4. Register Webflow Webhooks

Register Webflow webhooks on the Gulch site, all pointing at the same URL:

- Site ID: `684345d2fa9a950b8116b072`
- URL: `https://basetbhtpifqbsqmgedv.supabase.co/functions/v1/webflow-webhook?secret=akBzbWluZUBmMG50ZXo0ZXYzciE`
- Trigger types:
  - `collection_item_created` — new item (already registered 2026-06-30)
  - `collection_item_published` — any published edit; also items published after a draft period
  - `collection_item_unpublished` — the founder's cancel flow; the event is hidden in the app
  - `collection_item_deleted` — same as unpublished
  - `site_publish` — full reconcile in the background (debounced to one per 2 minutes)

`collection_item_changed` is deliberately not registered: it fires on staged edits, and the app mirrors only what is published.

```sh
for t in collection_item_published collection_item_unpublished collection_item_deleted site_publish; do
  curl -s -X POST "https://api.webflow.com/v2/sites/684345d2fa9a950b8116b072/webhooks" \
    -H "Authorization: Bearer $GULCH_WEBFLOW_API_KEY" -H "Content-Type: application/json" \
    -d "{\"triggerType\":\"$t\",\"url\":\"$WEBHOOK_URL\"}"
done
curl -s -H "Authorization: Bearer $GULCH_WEBFLOW_API_KEY" \
  https://api.webflow.com/v2/sites/684345d2fa9a950b8116b072/webhooks | jq '.webhooks[] | {triggerType, url}'
```

## 4a. Backfill after the first deploy

Hide events that were unpublished before the new triggers existed:

```sh
curl -s -X POST "https://basetbhtpifqbsqmgedv.supabase.co/functions/v1/refresh-tick?source=manual" \
  -H "Authorization: Bearer $GULCH_REFRESH_SECRET" | jq .presence
```

The presence pass hides at most `max(25, 10% of stored events)` per run and reports the rest as `presence.deferred`. Rerun the manual refresh until `deferred` is `0`.

Then confirm in `sync_runs` (`select * from public.sync_runs order by started_at desc limit 3`).

## 5. Verify

Post a sample `collection_item_created` payload to the webhook URL with a known live collection item ID.

Confirm:

- The function returns `200`.
- The corresponding `locations`, `events`, or `shows` row is upserted.
- For a location with an address, `latitude`, `longitude`, `geocode_status`, and `geocoded_at` are populated as expected.

