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

const organizerItem = {
  ...envelope,
  id: "organizer-123",
  lastUpdated: "2026-06-02T12:00:00.000Z",
  fieldData: {
    name: "Organizer 123",
    slug: "organizer-123",
    "website-url": "https://example.com",
    "is-featured": true
  }
};

const eventItem = {
  ...envelope,
  id: "event-123",
  lastUpdated: "2026-06-02T12:00:00.000Z",
  fieldData: {
    name: "Event 123",
    slug: "event-123",
    "start-date-time": "2026-07-03T22:00:00.000Z",
    "additional-organizers": ["organizer-123", "missing-organizer"]
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
    loadKnownOrganizerIds: async () => new Set(),
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
      is_organizer: false,
      managing_organizer_id: null,
      webflow_last_updated: "2026-06-02T12:00:00.000Z",
      latitude: 33.76,
      longitude: -84.36,
      geocode_status: "ok",
      geocoded_at: "2026-06-29T10:00:00.000Z"
    }]
  }]);
});

Deno.test("webhook upserts a created organizer item", async () => {
  const calls: unknown[] = [];
  const handler = createWebhookHandler({
    env: (key) => ({
      GULCH_WEBHOOK_SECRET: "right",
      GULCH_WEBFLOW_API_KEY: "webflow"
    })[key],
    fetchLiveItemFn: async () => organizerItem,
    loadKnownOrganizerIds: async () => new Set(),
    upsert: async (table, rows) => {
      calls.push({ table, rows });
    }
  });

  const response = await handler(new Request("https://example.test?secret=right", {
    method: "POST",
    body: JSON.stringify({
      triggerType: "collection_item_created",
      payload: { collectionId: "6a430e64b51f80db57a22b3c", id: "organizer-123" }
    })
  }));

  assertEquals(response.status, 200);
  assertEquals(calls, [{
    table: "organizers",
    rows: [{
      webflow_item_id: "organizer-123",
      name: "Organizer 123",
      slug: "organizer-123",
      website_url: "https://example.com",
      instagram_url: null,
      facebook_url: null,
      is_featured: true,
      custom_color: null,
      webflow_last_updated: "2026-06-02T12:00:00.000Z"
    }]
  }]);
});

Deno.test("webhook replaces event organizers for created events and skips dangling organizers", async () => {
  const calls: unknown[] = [];
  const handler = createWebhookHandler({
    env: (key) => ({
      GULCH_WEBHOOK_SECRET: "right",
      GULCH_WEBFLOW_API_KEY: "webflow"
    })[key],
    fetchLiveItemFn: async () => eventItem,
    loadKnownOrganizerIds: async () => new Set(["organizer-123"]),
    upsert: async (table, rows) => {
      calls.push({ table, rows });
    },
    replaceEventOrganizers: async (eventId, rows, knownOrganizerIds) => {
      calls.push({
        eventId,
        rows: rows.filter((row) => knownOrganizerIds.has(row.organizer_id))
      });
      return { inserted: 1, skipped: 1 };
    }
  });

  const response = await handler(new Request("https://example.test?secret=right", {
    method: "POST",
    body: JSON.stringify({
      triggerType: "collection_item_created",
      payload: { collectionId: "6845d39c294d60e4c197cee9", id: "event-123" }
    })
  }));

  assertEquals(response.status, 200);
  assertEquals(calls, [
    {
      table: "events",
      rows: [{
        webflow_item_id: "event-123",
        name: "Event 123",
        slug: "event-123",
        start_at: "2026-07-03T22:00:00.000Z",
        end_at: null,
        custom_time_description: null,
        location_id: null,
        external_link: null,
        tickets_required: false,
        editors_pick: false,
        webflow_last_updated: "2026-06-02T12:00:00.000Z"
      }]
    },
    {
      eventId: "event-123",
      rows: [{ event_id: "event-123", organizer_id: "organizer-123" }]
    }
  ]);
});

Deno.test("webhook-created event relies on the database default image status", async () => {
  const calls: { table: string; rows: readonly Record<string, unknown>[] }[] = [];
  const handler = createWebhookHandler({
    env: (key) => ({
      GULCH_WEBHOOK_SECRET: "right",
      GULCH_WEBFLOW_API_KEY: "webflow"
    })[key],
    fetchLiveItemFn: async () => ({
      ...eventItem,
      fieldData: {
        ...eventItem.fieldData,
        "external-link": "https://www.instagram.com/p/new-event/"
      }
    }),
    loadKnownOrganizerIds: async () => new Set(["organizer-123"]),
    upsert: async (table, rows) => {
      calls.push({ table, rows: rows as readonly Record<string, unknown>[] });
    },
    replaceEventOrganizers: async () => ({ inserted: 1, skipped: 1 })
  });

  const response = await handler(new Request("https://example.test?secret=right", {
    method: "POST",
    body: JSON.stringify({
      triggerType: "collection_item_created",
      payload: { collectionId: "6845d39c294d60e4c197cee9", id: "event-123" }
    })
  }));

  assertEquals(response.status, 200);
  assertEquals(calls[0]?.table, "events");
  assertEquals("image_status" in (calls[0]?.rows[0] ?? {}), false);
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
    loadKnownOrganizerIds: async () => new Set(),
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
    loadKnownOrganizerIds: async () => new Set(),
    upsert: async () => {}
  });

  const missing = await handler(new Request("https://example.test?secret=right", {
    method: "POST",
    body
  }));

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

  assertEquals(missing.status, 401);
  assertEquals(bad.status, 401);
  assertEquals(good.status, 200);
});

Deno.test("webhook ignores non-created events with 200", async () => {
  const handler = createWebhookHandler({
    env: (key) => key === "GULCH_WEBHOOK_SECRET" ? "right" : undefined,
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
