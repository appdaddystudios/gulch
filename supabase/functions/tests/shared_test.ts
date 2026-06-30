import { hmacSha256Hex, verifyHmacSha256 } from "../_shared/auth.ts";
import { geocode } from "../_shared/geocode.ts";
import { mapEvent, mapLocation } from "../_shared/mappers.ts";
import { reconcile } from "../_shared/reconcile.ts";
import { fetchLiveItem, fetchLiveItems } from "../_shared/webflow.ts";
import { assert, assertEquals, assertMatch, envelope } from "./helpers.ts";

Deno.test("mappers normalize nullable optional strings like shared package", () => {
  const event = mapEvent({
    ...envelope,
    id: "event-empty-link",
    lastUpdated: "2026-06-04T12:00:00.000Z",
    fieldData: {
      name: "Empty Link Event",
      slug: "empty-link-event",
      "start-date-time": "2026-07-03T22:00:00.000Z",
      "external-link": "   "
    }
  });

  assertEquals(event.external_link, null);

  const location = mapLocation({
    ...envelope,
    id: "location-empty-optional",
    lastUpdated: "2026-06-03T12:00:00.000Z",
    fieldData: {
      name: "Location",
      slug: "location",
      "neighborhood-optional": ""
    }
  });

  assertEquals(location.neighborhood, null);
});

Deno.test("fetchLiveItems filters draft and archived live items", async () => {
  const items = await fetchLiveItems("token", "collection", async () =>
    new Response(JSON.stringify({
      items: [
        { ...envelope, id: "keep", lastUpdated: "2026-06-01T00:00:00.000Z", fieldData: {} },
        { ...envelope, id: "draft", isDraft: true, lastUpdated: "2026-06-01T00:00:00.000Z", fieldData: {} },
        { ...envelope, id: "archived", isArchived: true, lastUpdated: "2026-06-01T00:00:00.000Z", fieldData: {} }
      ],
      pagination: { limit: 100, offset: 0, total: 3 }
    }))
  );

  assertEquals(items.map((item) => item.id), ["keep"]);
});

Deno.test("fetchLiveItem uses the single live item endpoint", async () => {
  let calledUrl = "";
  const item = await fetchLiveItem("token", "collection", "item-123", async (input) => {
    calledUrl = String(input);
    return new Response(JSON.stringify({
      ...envelope,
      id: "item-123",
      lastUpdated: "2026-06-01T00:00:00.000Z",
      fieldData: {}
    }));
  });

  assertEquals(item?.id, "item-123");
  assertEquals(calledUrl, "https://api.webflow.com/v2/collections/collection/items/item-123/live");
});

Deno.test("geocode uses Mapbox center as longitude then latitude and returns pending for null address", async () => {
  assertEquals(await geocode("mapbox", null), { latitude: null, longitude: null, status: "pending" });

  let calledUrl = "";
  const result = await geocode("mapbox", "10 Krog St NE", async (input) => {
    calledUrl = String(input);
    return new Response(JSON.stringify({ features: [{ center: [-84.36, 33.76] }] }));
  });

  assertEquals(result, { longitude: -84.36, latitude: 33.76, status: "ok" });
  assertMatch(calledUrl, /proximity=-84\.39%2C33\.75/);
  assertMatch(calledUrl, /bbox=-84\.55%2C33\.65%2C-84\.29%2C33\.89/);
  assertMatch(calledUrl, /country=us/);
  assertMatch(calledUrl, /limit=1/);
});

Deno.test("reconcile skips unchanged items and reuses unchanged location geocode fields", async () => {
  let geocodeCalls = 0;
  const items = [
    {
      ...envelope,
      id: "old-location",
      lastUpdated: "2026-06-01T00:00:00.000Z",
      fieldData: { name: "Old", slug: "old", "plain-text-name-address": "1 Same St" }
    },
    {
      ...envelope,
      id: "changed-location",
      lastUpdated: "2026-06-02T00:00:00.000Z",
      fieldData: { name: "Changed", slug: "changed", "plain-text-name-address": "2 New St" }
    }
  ];

  const result = await reconcile(items, "locations", {
    existingByIdLastUpdated: new Map([
      ["old-location", "2026-06-01T00:00:00.000Z"],
      ["changed-location", "2026-06-01T00:00:00.000Z"]
    ]),
    existingLocationsById: new Map([
      ["changed-location", {
        webflow_item_id: "changed-location",
        webflow_last_updated: "2026-06-01T00:00:00.000Z",
        name_address: "2 New St",
        latitude: 33.1,
        longitude: -84.1,
        geocode_status: "ok",
        geocoded_at: "2026-06-01T01:00:00.000Z"
      }]
    ]),
    geocoder: async () => {
      geocodeCalls += 1;
      return { latitude: 33.2, longitude: -84.2, status: "ok" };
    }
  });

  assertEquals(result.summary, { scanned: 2, upserted: 1, geocoded: 0, failed: 0 });
  assertEquals(geocodeCalls, 0);
  assert("latitude" in result.rows[0]);
  assertEquals(result.rows[0].latitude, 33.1);
});

Deno.test("HMAC helper verifies timestamp-prefixed raw body signatures", async () => {
  const signature = await hmacSha256Hex("secret", "123:{\"ok\":true}");
  assert(await verifyHmacSha256("secret", "123", "{\"ok\":true}", signature));
  assert(await verifyHmacSha256("secret", "123", "{\"ok\":true}", `sha256=${signature}`));
  assert(!(await verifyHmacSha256("secret", "123", "{\"ok\":false}", signature)));
});
