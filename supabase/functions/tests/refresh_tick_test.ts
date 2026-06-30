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
    fieldData: {
      name: "Changed",
      slug: "changed",
      "plain-text-name-address": "2 New St",
      "managing-organizer": "missing-organizer"
    }
  }
];

const organizerItems = [
  {
    ...envelope,
    id: "organizer-1",
    lastUpdated: "2026-06-03T00:00:00.000Z",
    fieldData: { name: "Organizer One", slug: "organizer-one" }
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
    fieldData: {
      name: "Changed Event",
      slug: "changed-event",
      "start-date-time": "2026-07-02T00:00:00.000Z",
      "additional-organizers": ["organizer-1", "missing-organizer"]
    }
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
  const upsertRows: Record<string, unknown[]> = {};
  const eventOrganizerReplacements: unknown[] = [];
  const managingRefUpdates: unknown[] = [];
  const handler = createRefreshHandler({
    env: (key) => ({
      GULCH_REFRESH_SECRET: "right",
      GULCH_WEBFLOW_API_KEY: "webflow",
      MAPBOX_TOKEN: "mapbox"
    })[key],
    loadExisting: async (table) => {
      if (table === "organizers") return [];
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
      if (collectionId === "6a430e64b51f80db57a22b3c") return organizerItems;
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
      upsertRows[table] = [...(upsertRows[table] ?? []), ...rows];
    },
    replaceAllEventOrganizers: async (rows) => {
      eventOrganizerReplacements.push(rows);
      return { inserted: rows.length };
    },
    updateManagingOrganizerRefs: async (updates) => {
      managingRefUpdates.push(...updates);
      return { updated: updates.length };
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
  assertEquals(upsertOrder, ["organizers", "locations", "events"]);
  assertEquals((upsertRows.locations?.[0] as { managing_organizer_id: string | null }).managing_organizer_id, null);
  assertEquals(eventOrganizerReplacements, [[{ event_id: "changed-event", organizer_id: "organizer-1" }]]);
  assertEquals(managingRefUpdates, []);
  assertEquals(summary, {
    organizers: { scanned: 1, upserted: 1, geocoded: 0, failed: 0 },
    locations: { scanned: 2, upserted: 1, geocoded: 1, failed: 0 },
    events: { scanned: 2, upserted: 1, geocoded: 0, failed: 0 },
    shows: { scanned: 0, upserted: 0, geocoded: 0, failed: 0 },
    eventOrganizers: { derived: 2, replaced: 1, skipped: 1 },
    managingRefs: { updated: 0 }
  });
});

Deno.test("refresh-tick fully reconciles organizer relationships for unchanged rows", async () => {
  const eventOrganizerReplacements: unknown[] = [];
  const managingRefUpdates: unknown[] = [];
  const upserts: string[] = [];
  const handler = createRefreshHandler({
    env: (key) => ({
      GULCH_REFRESH_SECRET: "right",
      GULCH_WEBFLOW_API_KEY: "webflow",
      MAPBOX_TOKEN: "mapbox"
    })[key],
    loadExisting: async (table) => {
      if (table === "organizers") {
        return [{ webflow_item_id: "organizer-1", webflow_last_updated: "2026-06-03T00:00:00.000Z" }];
      }
      if (table === "locations") {
        return [
          {
            webflow_item_id: "managed-location",
            webflow_last_updated: "2026-06-01T00:00:00.000Z",
            name_address: "1 Same St",
            managing_organizer_id: null
          },
          {
            webflow_item_id: "unchanged-location",
            webflow_last_updated: "2026-06-01T00:00:00.000Z",
            name_address: "2 Same St",
            managing_organizer_id: "organizer-1"
          },
          {
            webflow_item_id: "dangling-location",
            webflow_last_updated: "2026-06-01T00:00:00.000Z",
            name_address: "3 Same St",
            managing_organizer_id: "old-organizer"
          }
        ];
      }
      if (table === "events") {
        return [{ webflow_item_id: "same-event", webflow_last_updated: "2026-06-01T00:00:00.000Z" }];
      }
      return [];
    },
    fetchItems: async (_token, collectionId) => {
      if (collectionId === "6a430e64b51f80db57a22b3c") return organizerItems;
      if (collectionId === "6843bee91e942f36fd3adc06") {
        return [
          {
            ...envelope,
            id: "managed-location",
            lastUpdated: "2026-06-01T00:00:00.000Z",
            fieldData: {
              name: "Managed",
              slug: "managed",
              "plain-text-name-address": "1 Same St",
              "managing-organizer": "organizer-1"
            }
          },
          {
            ...envelope,
            id: "unchanged-location",
            lastUpdated: "2026-06-01T00:00:00.000Z",
            fieldData: {
              name: "Unchanged",
              slug: "unchanged",
              "plain-text-name-address": "2 Same St",
              "managing-organizer": "organizer-1"
            }
          },
          {
            ...envelope,
            id: "dangling-location",
            lastUpdated: "2026-06-01T00:00:00.000Z",
            fieldData: {
              name: "Dangling",
              slug: "dangling",
              "plain-text-name-address": "3 Same St",
              "managing-organizer": "missing-organizer"
            }
          }
        ];
      }
      if (collectionId === "6845d39c294d60e4c197cee9") {
        return [
          {
            ...envelope,
            id: "same-event",
            lastUpdated: "2026-06-01T00:00:00.000Z",
            fieldData: {
              name: "Same Event",
              slug: "same-event",
              "start-date-time": "2026-07-01T00:00:00.000Z",
              "additional-organizers": ["organizer-1", "missing-organizer"]
            }
          }
        ];
      }
      return [];
    },
    geocoder: async () => ({ latitude: 33.77, longitude: -84.37, status: "ok" }),
    upsert: async (table, rows) => {
      if (rows.length > 0) upserts.push(table);
    },
    replaceAllEventOrganizers: async (rows) => {
      eventOrganizerReplacements.push(rows);
      return { inserted: rows.length };
    },
    updateManagingOrganizerRefs: async (updates) => {
      managingRefUpdates.push(...updates);
      return { updated: updates.length };
    }
  });

  const response = await handler(new Request("https://example.test", {
    method: "POST",
    headers: { authorization: "Bearer right" }
  }));
  const summary = await response.json();

  assertEquals(response.status, 200);
  assertEquals(upserts, []);
  assertEquals(eventOrganizerReplacements, [[{ event_id: "same-event", organizer_id: "organizer-1" }]]);
  assertEquals(managingRefUpdates, [
    { locationId: "managed-location", managingOrganizerId: "organizer-1" },
    { locationId: "dangling-location", managingOrganizerId: null }
  ]);
  assertEquals(summary.eventOrganizers, { derived: 2, replaced: 1, skipped: 1 });
  assertEquals(summary.managingRefs, { updated: 2 });
});

Deno.test("refresh-tick resets event image status only when a changed event external link changes", async () => {
  const upsertRows: Record<string, unknown[]> = {};
  const handler = createRefreshHandler({
    env: (key) => ({
      GULCH_REFRESH_SECRET: "right",
      GULCH_WEBFLOW_API_KEY: "webflow",
      MAPBOX_TOKEN: "mapbox"
    })[key],
    loadExisting: async (table) => {
      if (table === "events") {
        return [
          {
            webflow_item_id: "changed-link-event",
            webflow_last_updated: "2026-06-01T00:00:00.000Z",
            external_link: "https://www.instagram.com/p/old/"
          },
          {
            webflow_item_id: "same-link-event",
            webflow_last_updated: "2026-06-01T00:00:00.000Z",
            external_link: "https://www.instagram.com/p/same/"
          },
          {
            webflow_item_id: "unchanged-event",
            webflow_last_updated: "2026-06-03T00:00:00.000Z",
            external_link: "https://www.instagram.com/p/unchanged/"
          }
        ];
      }
      return [];
    },
    fetchItems: async (_token, collectionId) => {
      if (collectionId === "6845d39c294d60e4c197cee9") {
        return [
          {
            ...envelope,
            id: "changed-link-event",
            lastUpdated: "2026-06-03T00:00:00.000Z",
            fieldData: {
              name: "Changed Link Event",
              slug: "changed-link-event",
              "start-date-time": "2026-07-01T00:00:00.000Z",
              "external-link": "https://www.instagram.com/p/new/"
            }
          },
          {
            ...envelope,
            id: "same-link-event",
            lastUpdated: "2026-06-03T00:00:00.000Z",
            fieldData: {
              name: "Same Link Event",
              slug: "same-link-event",
              "start-date-time": "2026-07-02T00:00:00.000Z",
              "external-link": "https://www.instagram.com/p/same/"
            }
          },
          {
            ...envelope,
            id: "unchanged-event",
            lastUpdated: "2026-06-03T00:00:00.000Z",
            fieldData: {
              name: "Unchanged Event",
              slug: "unchanged-event",
              "start-date-time": "2026-07-03T00:00:00.000Z",
              "external-link": "https://www.instagram.com/p/unchanged/"
            }
          }
        ];
      }
      return [];
    },
    geocoder: async () => ({ latitude: null, longitude: null, status: "pending" }),
    upsert: async (table, rows) => {
      upsertRows[table] = [...(upsertRows[table] ?? []), ...rows];
    },
    replaceAllEventOrganizers: async (rows) => ({ inserted: rows.length }),
    updateManagingOrganizerRefs: async (updates) => ({ updated: updates.length })
  });

  const response = await handler(new Request("https://example.test", {
    method: "POST",
    headers: { authorization: "Bearer right" }
  }));

  assertEquals(response.status, 200);
  assertEquals(upsertRows.events, [
    {
      webflow_item_id: "changed-link-event",
      name: "Changed Link Event",
      slug: "changed-link-event",
      start_at: "2026-07-01T00:00:00.000Z",
      end_at: null,
      custom_time_description: null,
      location_id: null,
      external_link: "https://www.instagram.com/p/new/",
      tickets_required: false,
      webflow_last_updated: "2026-06-03T00:00:00.000Z",
      image_status: "pending"
    },
    {
      webflow_item_id: "same-link-event",
      name: "Same Link Event",
      slug: "same-link-event",
      start_at: "2026-07-02T00:00:00.000Z",
      end_at: null,
      custom_time_description: null,
      location_id: null,
      external_link: "https://www.instagram.com/p/same/",
      tickets_required: false,
      webflow_last_updated: "2026-06-03T00:00:00.000Z"
    }
  ]);
});
