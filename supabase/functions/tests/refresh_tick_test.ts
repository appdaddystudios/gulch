import { createRefreshHandler } from "../refresh-tick/index.ts";
import { assertEquals, envelope } from "./helpers.ts";

const locationItems = [
  {
    ...envelope,
    id: "same-location",
    lastUpdated: "2026-06-01T00:00:00.000Z",
    fieldData: { name: "Same", slug: "same", "plain-text-name-address": "1 Same St" }
  },
  {
    ...envelope,
    id: "changed-location",
    lastUpdated: "2026-06-02T00:00:00.000Z",
    fieldData: { name: "Changed", slug: "changed", "plain-text-name-address": "2 New St" }
  }
];

const eventItems = [
  {
    ...envelope,
    id: "same-event",
    lastUpdated: "2026-06-01T00:00:00.000Z",
    fieldData: { name: "Same Event", slug: "same-event", "start-date-time": "2026-07-01T00:00:00.000Z" }
  },
  {
    ...envelope,
    id: "changed-event",
    lastUpdated: "2026-06-03T00:00:00.000Z",
    fieldData: { name: "Changed Event", slug: "changed-event", "start-date-time": "2026-07-02T00:00:00.000Z" }
  }
];

Deno.test("refresh-tick rejects wrong bearer secret", async () => {
  const handler = createRefreshHandler({ env: (key) => key === "GULCH_REFRESH_SECRET" ? "right" : "unused" });
  const response = await handler(new Request("https://example.test", {
    method: "POST",
    headers: { authorization: "Bearer wrong" }
  }));

  assertEquals(response.status, 401);
});

Deno.test("refresh-tick upserts only changed items, geocodes only changed locations, and preserves order", async () => {
  let geocodeCalls = 0;
  const upsertOrder: string[] = [];
  const handler = createRefreshHandler({
    env: (key) => ({
      GULCH_REFRESH_SECRET: "right",
      GULCH_WEBFLOW_API_KEY: "webflow",
      MAPBOX_TOKEN: "mapbox"
    })[key],
    loadExisting: async (table) => {
      if (table === "locations") {
        return [
          { webflow_item_id: "same-location", webflow_last_updated: "2026-06-01T00:00:00.000Z", name_address: "1 Same St" },
          { webflow_item_id: "changed-location", webflow_last_updated: "2026-06-01T00:00:00.000Z", name_address: "old address" }
        ];
      }
      if (table === "events") {
        return [
          { webflow_item_id: "same-event", webflow_last_updated: "2026-06-01T00:00:00.000Z" },
          { webflow_item_id: "changed-event", webflow_last_updated: "2026-06-02T00:00:00.000Z" }
        ];
      }
      return [];
    },
    fetchItems: async (_token, collectionId) => {
      if (collectionId === "6843bee91e942f36fd3adc06") return locationItems;
      if (collectionId === "6845d39c294d60e4c197cee9") return eventItems;
      return [];
    },
    geocoder: async () => {
      geocodeCalls += 1;
      return { latitude: 33.77, longitude: -84.37, status: "ok" };
    },
    upsert: async (table, rows) => {
      if (rows.length > 0) upsertOrder.push(table);
    },
    now: () => "2026-06-29T10:00:00.000Z"
  });

  const response = await handler(new Request("https://example.test", {
    method: "POST",
    headers: { authorization: "Bearer right" }
  }));
  const summary = await response.json();

  assertEquals(response.status, 200);
  assertEquals(geocodeCalls, 1);
  assertEquals(upsertOrder, ["locations", "events"]);
  assertEquals(summary, {
    locations: { scanned: 2, upserted: 1, geocoded: 1, failed: 0 },
    events: { scanned: 2, upserted: 1, geocoded: 0, failed: 0 },
    shows: { scanned: 0, upserted: 0, geocoded: 0, failed: 0 }
  });
});

