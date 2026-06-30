import { hmacSha256Hex } from "../_shared/auth.ts";
import { createWebhookHandler } from "../webflow-webhook/index.ts";
import { assertEquals, envelope } from "./helpers.ts";

const locationItem = {
  ...envelope,
  id: "location-123",
  lastUpdated: "2026-06-02T12:00:00.000Z",
  fieldData: {
    name: "Tim Barrett Designs Inc.",
    slug: "tim-barrett-designs-inc",
    "plain-text-name-address": "Tim Barrett Designs Inc., 10 Krog St NE"
  }
};

const createdLocationPayload = {
  triggerType: "collection_item_created",
  payload: {
    collectionId: "6843bee91e942f36fd3adc06",
    id: "location-123"
  }
};

Deno.test("webhook rejects missing or wrong shared secret", async () => {
  const handler = createWebhookHandler({ env: (key) => key === "GULCH_WEBHOOK_SECRET" ? "right" : "unused" });
  const missing = await handler(new Request("https://example.test", { method: "POST", body: "{}" }));
  const wrong = await handler(new Request("https://example.test?secret=wrong", { method: "POST", body: "{}" }));

  assertEquals(missing.status, 401);
  assertEquals(wrong.status, 401);
});

Deno.test("webhook maps, geocodes, and upserts a created location item", async () => {
  const calls: unknown[] = [];
  const handler = createWebhookHandler({
    env: (key) => ({
      GULCH_WEBHOOK_SECRET: "right",
      GULCH_WEBFLOW_API_KEY: "webflow",
      MAPBOX_TOKEN: "mapbox"
    })[key],
    fetchLiveItemFn: async () => locationItem,
    geocoder: async () => ({ latitude: 33.76, longitude: -84.36, status: "ok" }),
    upsert: async (table, rows) => {
      calls.push({ table, rows });
    },
    now: () => "2026-06-29T10:00:00.000Z"
  });

  const response = await handler(new Request("https://example.test?secret=right", {
    method: "POST",
    body: JSON.stringify(createdLocationPayload)
  }));

  assertEquals(response.status, 200);
  assertEquals(calls, [{
    table: "locations",
    rows: [{
      webflow_item_id: "location-123",
      name: "Tim Barrett Designs Inc.",
      slug: "tim-barrett-designs-inc",
      name_address: "Tim Barrett Designs Inc., 10 Krog St NE",
      google_maps_url: null,
      neighborhood: null,
      parking: null,
      hide_from_list: false,
      webflow_last_updated: "2026-06-02T12:00:00.000Z",
      latitude: 33.76,
      longitude: -84.36,
      geocode_status: "ok",
      geocoded_at: "2026-06-29T10:00:00.000Z"
    }]
  }]);
});

Deno.test("webhook skips HMAC when no Webflow signing secret is configured", async () => {
  const calls: unknown[] = [];
  const handler = createWebhookHandler({
    env: (key) => ({
      GULCH_WEBHOOK_SECRET: "right",
      GULCH_WEBFLOW_API_KEY: "webflow",
      MAPBOX_TOKEN: "mapbox"
    })[key],
    fetchLiveItemFn: async () => locationItem,
    geocoder: async () => ({ latitude: 33.76, longitude: -84.36, status: "ok" }),
    upsert: async (table, rows) => {
      calls.push({ table, rows });
    }
  });

  const response = await handler(new Request("https://example.test?secret=right", {
    method: "POST",
    headers: {
      "x-webflow-timestamp": "123",
      "x-webflow-signature": "sha256=bad"
    },
    body: JSON.stringify(createdLocationPayload)
  }));

  assertEquals(response.status, 200);
  assertEquals(calls.length, 1);
});

Deno.test("webhook verifies HMAC with separate Webflow signing secret when configured", async () => {
  const body = JSON.stringify(createdLocationPayload);
  const goodSignature = await hmacSha256Hex("signing-secret", `123:${body}`);

  const handler = createWebhookHandler({
    env: (key) => ({
      GULCH_WEBHOOK_SECRET: "right",
      GULCH_WEBFLOW_SIGNING_SECRET: "signing-secret",
      GULCH_WEBFLOW_API_KEY: "webflow",
      MAPBOX_TOKEN: "mapbox"
    })[key],
    fetchLiveItemFn: async () => locationItem,
    geocoder: async () => ({ latitude: 33.76, longitude: -84.36, status: "ok" }),
    upsert: async () => {}
  });

  const bad = await handler(new Request("https://example.test?secret=right", {
    method: "POST",
    headers: {
      "x-webflow-timestamp": "123",
      "x-webflow-signature": "sha256=bad"
    },
    body
  }));

  const good = await handler(new Request("https://example.test?secret=right", {
    method: "POST",
    headers: {
      "x-webflow-timestamp": "123",
      "x-webflow-signature": `sha256=${goodSignature}`
    },
    body
  }));

  assertEquals(bad.status, 401);
  assertEquals(good.status, 200);
});

Deno.test("webhook ignores non-created events with 200", async () => {
  const handler = createWebhookHandler({
    env: (key) => key === "GULCH_WEBHOOK_SECRET" ? "right" : "unused",
    upsert: async () => {
      throw new Error("should not upsert");
    }
  });

  const response = await handler(new Request("https://example.test?secret=right", {
    method: "POST",
    body: JSON.stringify({ triggerType: "collection_item_changed" })
  }));

  assertEquals(response.status, 200);
  assertEquals(await response.json(), { ok: true });
});
