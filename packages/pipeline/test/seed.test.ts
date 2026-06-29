import type { Database } from "@gulch/db";
import { describe, expect, it } from "vitest";

import { runSeed, WEBFLOW_COLLECTION_IDS, type PipelineDbClient } from "../src/seed";

type Insert =
  | Database["public"]["Tables"]["locations"]["Insert"]
  | Database["public"]["Tables"]["events"]["Insert"]
  | Database["public"]["Tables"]["shows"]["Insert"];

const envelope = {
  cmsLocaleId: "locale-123",
  lastPublished: "2026-06-01T12:00:00.000Z",
  createdOn: "2026-05-01T12:00:00.000Z",
  isArchived: false,
  isDraft: false
};

const locationItem = (id: string, address: string | null) => ({
  ...envelope,
  id,
  lastUpdated: "2026-06-02T12:00:00.000Z",
  fieldData: {
    name: id,
    slug: id,
    "plain-text-name-address": address
  }
});

const eventItem = {
  ...envelope,
  id: "event-1",
  lastUpdated: "2026-06-03T12:00:00.000Z",
  fieldData: {
    name: "Event One",
    slug: "event-one",
    "start-date-time": "2026-07-01T12:00:00.000Z",
    location: "location-1",
    "external-link": "https://example.com/event"
  }
};

const showItem = {
  ...envelope,
  id: "show-1",
  lastUpdated: "2026-06-04T12:00:00.000Z",
  fieldData: {
    name: "Show One",
    slug: "show-one",
    location: "location-1",
    "external-link": "https://example.com/show"
  }
};

describe("runSeed", () => {
  it("maps, geocodes, and upserts locations before dependent event and show rows", async () => {
    const upserts: { readonly table: string; readonly rows: readonly Insert[] }[] = [];
    const geocodedAddresses: string[] = [];
    const db: PipelineDbClient = {
      from: (table) => ({
        upsert: async (rows) => {
          upserts.push({ table, rows });
          return { error: null };
        }
      })
    };

    const summary = await runSeed({
      webflow: {
        fetchAllItems: async (collectionId) => {
          if (collectionId === WEBFLOW_COLLECTION_IDS.locations) {
            return [locationItem("location-1", "10 Krog St NE"), locationItem("location-2", null)];
          }
          if (collectionId === WEBFLOW_COLLECTION_IDS.events) {
            return [eventItem];
          }
          if (collectionId === WEBFLOW_COLLECTION_IDS.shows) {
            return [showItem];
          }
          throw new Error(`Unexpected collection ${collectionId}`);
        }
      },
      geocoder: {
        geocode: async (address) => {
          geocodedAddresses.push(address);
          return { latitude: 33.772, longitude: -84.371, status: "ok" };
        }
      },
      db
    });

    expect(upserts.map((call) => call.table)).toEqual(["locations", "events", "shows"]);
    expect(geocodedAddresses).toEqual(["10 Krog St NE"]);

    const [locationRows, eventRows, showRows] = upserts.map((call) => call.rows);
    expect(locationRows?.[0]).toMatchObject({
      webflow_item_id: "location-1",
      latitude: 33.772,
      longitude: -84.371,
      geocode_status: "ok"
    });
    expect(locationRows?.[1]).toMatchObject({
      webflow_item_id: "location-2",
      latitude: null,
      longitude: null,
      geocode_status: "pending"
    });
    expect(eventRows?.[0]).toMatchObject({ webflow_item_id: "event-1", location_id: "location-1" });
    expect(showRows?.[0]).toMatchObject({ webflow_item_id: "show-1", location_id: "location-1" });
    expect(summary).toEqual({
      locations: { fetched: 2, upserted: 2, geocoded: 1, geocodeFailed: 0 },
      events: { fetched: 1, upserted: 1 },
      shows: { fetched: 1, upserted: 1 }
    });
  });

  it("counts failed geocodes without failing the seed", async () => {
    const db: PipelineDbClient = {
      from: () => ({
        upsert: async () => ({ error: null })
      })
    };

    const summary = await runSeed({
      webflow: {
        fetchAllItems: async (collectionId) => {
          if (collectionId === WEBFLOW_COLLECTION_IDS.locations) {
            return [locationItem("location-1", "Unknown")];
          }
          return collectionId === WEBFLOW_COLLECTION_IDS.events ? [] : [];
        }
      },
      geocoder: {
        geocode: async () => ({ latitude: null, longitude: null, status: "failed" })
      },
      db
    });

    expect(summary.locations).toEqual({ fetched: 1, upserted: 1, geocoded: 0, geocodeFailed: 1 });
  });

  it("wraps stage errors with table and stage context", async () => {
    const db: PipelineDbClient = {
      from: () => ({
        upsert: async () => ({ error: { message: "permission denied" } })
      })
    };

    await expect(
      runSeed({
        webflow: {
          fetchAllItems: async () => [locationItem("location-1", null)]
        },
        geocoder: {
          geocode: async () => ({ latitude: 33.772, longitude: -84.371, status: "ok" })
        },
        db
      })
    ).rejects.toThrow(/Seed failed during locations upsert: permission denied/);

    await expect(
      runSeed({
        webflow: {
          fetchAllItems: async () => {
            throw new Error("webflow unavailable");
          }
        },
        geocoder: {
          geocode: async () => ({ latitude: 33.772, longitude: -84.371, status: "ok" })
        },
        db
      })
    ).rejects.toThrow(/Seed failed during locations fetch: webflow unavailable/);
  });
});
