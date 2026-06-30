import type { Database } from "@gulch/db";
import { afterEach, describe, expect, it, vi } from "vitest";

import { runSeed, WEBFLOW_COLLECTION_IDS, type PipelineDbClient } from "../src/seed";

type Insert =
  | Database["public"]["Tables"]["locations"]["Insert"]
  | Database["public"]["Tables"]["events"]["Insert"]
  | Database["public"]["Tables"]["shows"]["Insert"]
  | Database["public"]["Tables"]["organizers"]["Insert"]
  | Database["public"]["Tables"]["event_organizers"]["Insert"];

const envelope = {
  cmsLocaleId: "locale-123",
  lastPublished: "2026-06-01T12:00:00.000Z",
  createdOn: "2026-05-01T12:00:00.000Z",
  isArchived: false,
  isDraft: false
};

const organizerItem = (id: string) => ({
  ...envelope,
  id,
  lastUpdated: "2026-06-01T12:00:00.000Z",
  fieldData: {
    name: id,
    slug: id,
    "is-featured": true
  }
});

const locationItem = (id: string, address: string | null, managingOrganizer?: string | null) => ({
  ...envelope,
  id,
  lastUpdated: "2026-06-02T12:00:00.000Z",
  fieldData: {
    name: id,
    slug: id,
    "plain-text-name-address": address,
    "managing-organizer": managingOrganizer
  }
});

const eventItem = (additionalOrganizers?: readonly (string | { readonly id: string })[]) => ({
  ...envelope,
  id: "event-1",
  lastUpdated: "2026-06-03T12:00:00.000Z",
  fieldData: {
    name: "Event One",
    slug: "event-one",
    "start-date-time": "2026-07-01T12:00:00.000Z",
    location: "location-1",
    "external-link": "https://example.com/event",
    "additional-organizers": additionalOrganizers
  }
});

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
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("maps, geocodes, and upserts organizers before dependent rows and event organizers last", async () => {
    const upserts: {
      readonly table: string;
      readonly rows: readonly Insert[];
      readonly onConflict: string;
    }[] = [];
    const geocodedAddresses: string[] = [];
    const db: PipelineDbClient = {
      from: (table) => ({
        upsert: async (rows, options) => {
          upserts.push({ table, rows, onConflict: options.onConflict });
          return { error: null };
        }
      })
    };

    const summary = await runSeed({
      webflow: {
        fetchAllItems: async (collectionId) => {
          if (collectionId === WEBFLOW_COLLECTION_IDS.organizers) {
            return [organizerItem("organizer-1"), organizerItem("organizer-2")];
          }
          if (collectionId === WEBFLOW_COLLECTION_IDS.locations) {
            return [
              locationItem("location-1", "10 Krog St NE", "organizer-1"),
              locationItem("location-2", null, "missing-organizer")
            ];
          }
          if (collectionId === WEBFLOW_COLLECTION_IDS.events) {
            return [eventItem(["organizer-1", "organizer-2", "organizer-1", "missing-organizer"])];
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

    expect(upserts.map((call) => call.table)).toEqual(["organizers", "locations", "events", "shows", "event_organizers"]);
    expect(upserts.map((call) => call.onConflict)).toEqual([
      "webflow_item_id",
      "webflow_item_id",
      "webflow_item_id",
      "webflow_item_id",
      "event_id,organizer_id"
    ]);
    expect(geocodedAddresses).toEqual(["10 Krog St NE"]);

    const [organizerRows, locationRows, eventRows, showRows, eventOrganizerRows] = upserts.map((call) => call.rows);
    expect(organizerRows?.[0]).toMatchObject({ webflow_item_id: "organizer-1", is_featured: true });
    expect(locationRows?.[0]).toMatchObject({
      webflow_item_id: "location-1",
      managing_organizer_id: "organizer-1",
      latitude: 33.772,
      longitude: -84.371,
      geocode_status: "ok"
    });
    expect(locationRows?.[1]).toMatchObject({
      webflow_item_id: "location-2",
      managing_organizer_id: null,
      latitude: null,
      longitude: null,
      geocode_status: "pending"
    });
    expect(eventRows?.[0]).toMatchObject({ webflow_item_id: "event-1", location_id: "location-1" });
    expect(showRows?.[0]).toMatchObject({ webflow_item_id: "show-1", location_id: "location-1" });
    expect(eventOrganizerRows).toEqual([
      { event_id: "event-1", organizer_id: "organizer-1" },
      { event_id: "event-1", organizer_id: "organizer-2" }
    ]);
    expect(summary).toEqual({
      organizers: { fetched: 2, upserted: 2 },
      locations: { fetched: 2, upserted: 2, geocoded: 1, geocodeFailed: 0 },
      events: { fetched: 1, upserted: 1 },
      shows: { fetched: 1, upserted: 1 },
      eventOrganizers: { derived: 3, upserted: 2, skipped: 1 }
    });
  });

  it("logs dangling managing organizer and event organizer skips", async () => {
    const info = vi.fn();
    const db: PipelineDbClient = {
      from: () => ({
        upsert: async () => ({ error: null })
      })
    };

    await runSeed({
      webflow: {
        fetchAllItems: async (collectionId) => {
          if (collectionId === WEBFLOW_COLLECTION_IDS.organizers) {
            return [organizerItem("known-organizer")];
          }
          if (collectionId === WEBFLOW_COLLECTION_IDS.locations) {
            return [locationItem("location-1", null, "unknown-organizer")];
          }
          if (collectionId === WEBFLOW_COLLECTION_IDS.events) {
            return [eventItem(["unknown-organizer"])];
          }
          return [];
        }
      },
      geocoder: {
        geocode: async () => ({ latitude: 33.772, longitude: -84.371, status: "ok" })
      },
      db,
      logger: { info, error: vi.fn() }
    });

    expect(info).toHaveBeenCalledWith("Nulling 1 dangling location managing organizer reference");
    expect(info).toHaveBeenCalledWith("Skipping 1 dangling event organizer reference");
  });

  it("is idempotent across repeated seeds", async () => {
    const rowsByTable = new Map<string, Map<string, Insert>>();
    const db: PipelineDbClient = {
      from: (table) => ({
        upsert: async (rows, options) => {
          const tableRows = rowsByTable.get(table) ?? new Map<string, Insert>();
          rowsByTable.set(table, tableRows);

          for (const row of rows) {
            const key =
              options.onConflict === "event_id,organizer_id"
                ? `${"event_id" in row ? row.event_id : ""}:${"organizer_id" in row ? row.organizer_id : ""}`
                : "webflow_item_id" in row
                  ? row.webflow_item_id
                  : "";
            tableRows.set(key, row);
          }

          return { error: null };
        }
      })
    };
    const options = {
      webflow: {
        fetchAllItems: async (collectionId: string) => {
          if (collectionId === WEBFLOW_COLLECTION_IDS.organizers) {
            return [organizerItem("organizer-1")];
          }
          if (collectionId === WEBFLOW_COLLECTION_IDS.locations) {
            return [locationItem("location-1", null, "organizer-1")];
          }
          if (collectionId === WEBFLOW_COLLECTION_IDS.events) {
            return [eventItem(["organizer-1", "organizer-1"])];
          }
          if (collectionId === WEBFLOW_COLLECTION_IDS.shows) {
            return [showItem];
          }
          return [];
        }
      },
      geocoder: {
        geocode: async () => ({ latitude: 33.772, longitude: -84.371, status: "ok" as const })
      },
      db
    };

    const first = await runSeed(options);
    const second = await runSeed(options);

    expect(second).toEqual(first);
    expect(rowsByTable.get("organizers")?.size).toBe(1);
    expect(rowsByTable.get("locations")?.size).toBe(1);
    expect(rowsByTable.get("events")?.size).toBe(1);
    expect(rowsByTable.get("shows")?.size).toBe(1);
    expect(rowsByTable.get("event_organizers")?.size).toBe(1);
  });

  it("skips event organizer rows with dangling event ids", async () => {
    vi.doMock("@gulch/shared", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@gulch/shared")>();
      return {
        ...actual,
        deriveEventOrganizers: () => [
          { event_id: "event-1", organizer_id: "organizer-1" },
          { event_id: "missing-event", organizer_id: "organizer-1" }
        ]
      };
    });
    const { runSeed: runSeedWithMock, WEBFLOW_COLLECTION_IDS: mockedIds } = await import("../src/seed");
    const upserts: { readonly table: string; readonly rows: readonly Insert[] }[] = [];
    const db: PipelineDbClient = {
      from: (table) => ({
        upsert: async (rows) => {
          upserts.push({ table, rows });
          return { error: null };
        }
      })
    };

    const summary = await runSeedWithMock({
      webflow: {
        fetchAllItems: async (collectionId) => {
          if (collectionId === mockedIds.organizers) {
            return [organizerItem("organizer-1")];
          }
          if (collectionId === mockedIds.events) {
            return [eventItem(["organizer-1"])];
          }
          return [];
        }
      },
      geocoder: {
        geocode: async () => ({ latitude: 33.772, longitude: -84.371, status: "ok" })
      },
      db
    });

    expect(upserts.at(-1)).toEqual({
      table: "event_organizers",
      rows: [{ event_id: "event-1", organizer_id: "organizer-1" }]
    });
    expect(summary.eventOrganizers).toEqual({ derived: 2, upserted: 1, skipped: 1 });
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
          if (collectionId === WEBFLOW_COLLECTION_IDS.organizers) {
            return [];
          }
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
    expect(summary.organizers).toEqual({ fetched: 0, upserted: 0 });
    expect(summary.eventOrganizers).toEqual({ derived: 0, upserted: 0, skipped: 0 });
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
          fetchAllItems: async (collectionId) => {
            if (collectionId === WEBFLOW_COLLECTION_IDS.organizers) {
              return [];
            }
            if (collectionId === WEBFLOW_COLLECTION_IDS.locations) {
              return [locationItem("location-1", null)];
            }
            return [];
          }
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
    ).rejects.toThrow(/Seed failed during organizers fetch: webflow unavailable/);

    await expect(
      runSeed({
        webflow: {
          fetchAllItems: async (collectionId) => {
            if (collectionId === WEBFLOW_COLLECTION_IDS.organizers) {
              return [];
            }
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
