import { describe, expect, it } from "vitest";

import {
  MAP_EVENT_PAGE_SIZE,
  MAP_EVENT_SELECT,
  listMapVenues,
} from "./mapEvents";

type QueryResult = { data: unknown; error: unknown };

// Serves one result per query execution and records the requested ranges,
// so pagination behavior is observable.
const makePagedClient = (pages: readonly QueryResult[]) => {
  const ranges: Array<readonly [number, number]> = [];
  let call = 0;
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "gte", "order"]) {
    builder[method] = () => builder;
  }
  builder.range = (from: number, to: number) => {
    ranges.push([from, to]);
    return builder;
  };
  builder.then = (resolve: (value: QueryResult) => unknown) =>
    resolve(pages[Math.min(call++, pages.length - 1)] as QueryResult);
  return { client: { from: () => builder } as never, ranges };
};

const makeClient = (result: QueryResult) => makePagedClient([result]).client;

const venueA = {
  webflow_item_id: "loc-a",
  name: "El Sótano",
  latitude: 33.755,
  longitude: -84.39,
};

const venueB = {
  webflow_item_id: "loc-b",
  name: "Echo Gallery",
  latitude: 33.76,
  longitude: -84.36,
};

const makeRow = (id: string, startAt: string, locations: unknown) => ({
  webflow_item_id: id,
  name: `Event ${id}`,
  start_at: startAt,
  end_at: null,
  custom_time_description: null,
  image_url: null,
  image_status: "pending",
  tickets_required: false,
  editors_pick: false,
  external_link: "https://instagram.com/p/abc",
  locations,
  event_organizers: [],
});

describe("MAP_EVENT_SELECT", () => {
  it("requests coordinates alongside the event card columns", () => {
    expect(MAP_EVENT_SELECT).toContain("latitude");
    expect(MAP_EVENT_SELECT).toContain("longitude");
    for (const column of [
      "webflow_item_id",
      "start_at",
      "custom_time_description",
      "image_url",
      "editors_pick",
      "event_organizers(organizers(name))",
    ]) {
      expect(MAP_EVENT_SELECT).toContain(column);
    }
  });
});

describe("listMapVenues", () => {
  it("groups events sharing a venue into one pin, keeping start order", async () => {
    const rows = [
      makeRow("evt-1", "2026-08-01T00:00:00Z", venueA),
      makeRow("evt-2", "2026-08-02T00:00:00Z", venueB),
      makeRow("evt-3", "2026-08-03T00:00:00Z", venueA),
    ];

    const venues = await listMapVenues(makeClient({ data: rows, error: null }));

    expect(venues).toHaveLength(2);
    expect(venues[0]).toMatchObject({
      id: "loc-a",
      name: "El Sótano",
      latitude: 33.755,
      longitude: -84.39,
    });
    expect(venues[0]?.events.map((event) => event.id)).toEqual([
      "evt-1",
      "evt-3",
    ]);
    expect(venues[1]?.id).toBe("loc-b");
    expect(venues[1]?.events.map((event) => event.id)).toEqual(["evt-2"]);
  });

  it("orders venues by their earliest upcoming event", async () => {
    const rows = [
      makeRow("evt-1", "2026-08-01T00:00:00Z", venueB),
      makeRow("evt-2", "2026-08-02T00:00:00Z", venueA),
    ];

    const venues = await listMapVenues(makeClient({ data: rows, error: null }));

    expect(venues.map((venue) => venue.id)).toEqual(["loc-b", "loc-a"]);
  });

  it("maps events with the EventCard fields, including the venue name", async () => {
    const rows = [makeRow("evt-1", "2026-08-01T00:00:00Z", venueA)];

    const venues = await listMapVenues(makeClient({ data: rows, error: null }));

    expect(venues[0]?.events[0]).toMatchObject({
      id: "evt-1",
      name: "Event evt-1",
      startAt: "2026-08-01T00:00:00Z",
      locationName: "El Sótano",
    });
  });

  it("accepts array-form location embeds", async () => {
    const rows = [makeRow("evt-1", "2026-08-01T00:00:00Z", [venueA])];

    const venues = await listMapVenues(makeClient({ data: rows, error: null }));

    expect(venues[0]?.id).toBe("loc-a");
  });

  it("excludes events without a venue or without coordinates", async () => {
    const rows = [
      makeRow("evt-1", "2026-08-01T00:00:00Z", null),
      makeRow("evt-2", "2026-08-02T00:00:00Z", {
        ...venueA,
        latitude: null,
      }),
      makeRow("evt-3", "2026-08-03T00:00:00Z", {
        ...venueB,
        longitude: null,
      }),
      makeRow("evt-4", "2026-08-04T00:00:00Z", venueA),
    ];

    const venues = await listMapVenues(makeClient({ data: rows, error: null }));

    expect(venues).toHaveLength(1);
    expect(venues[0]?.events.map((event) => event.id)).toEqual(["evt-4"]);
  });

  it("paginates past a full page and merges venues across pages", async () => {
    const fullPage = Array.from({ length: MAP_EVENT_PAGE_SIZE }, (_, index) =>
      makeRow(`evt-${index}`, "2026-08-01T00:00:00Z", venueA),
    );
    const shortPage = [makeRow("evt-extra", "2026-08-02T00:00:00Z", venueA)];
    const { client, ranges } = makePagedClient([
      { data: fullPage, error: null },
      { data: shortPage, error: null },
    ]);

    const venues = await listMapVenues(client);

    expect(ranges).toEqual([
      [0, MAP_EVENT_PAGE_SIZE - 1],
      [MAP_EVENT_PAGE_SIZE, MAP_EVENT_PAGE_SIZE * 2 - 1],
    ]);
    expect(venues).toHaveLength(1);
    expect(venues[0]?.events).toHaveLength(MAP_EVENT_PAGE_SIZE + 1);
  });

  it("stops after a single short page", async () => {
    const { client, ranges } = makePagedClient([
      { data: [makeRow("evt-1", "2026-08-01T00:00:00Z", venueA)], error: null },
    ]);

    await listMapVenues(client);

    expect(ranges).toEqual([[0, MAP_EVENT_PAGE_SIZE - 1]]);
  });

  it("returns an empty list when data is null", async () => {
    await expect(
      listMapVenues(makeClient({ data: null, error: null })),
    ).resolves.toEqual([]);
  });

  it("throws when Supabase returns an error", async () => {
    const error = new Error("rls denied");
    await expect(
      listMapVenues(makeClient({ data: null, error })),
    ).rejects.toThrow("rls denied");
  });
});
