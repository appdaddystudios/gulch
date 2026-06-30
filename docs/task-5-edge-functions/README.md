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

## 4. Register Webflow Webhook

Register a Webflow webhook on the Gulch site:

- Site ID: `684345d2fa9a950b8116b072`
- Trigger type: `collection_item_created`
- URL: `https://<ref>.supabase.co/functions/v1/webflow-webhook?secret=<GULCH_WEBHOOK_SECRET>`

## 5. Verify

Post a sample `collection_item_created` payload to the webhook URL with a known live collection item ID.

Confirm:

- The function returns `200`.
- The corresponding `locations`, `events`, or `shows` row is upserted.
- For a location with an address, `latitude`, `longitude`, `geocode_status`, and `geocoded_at` are populated as expected.

