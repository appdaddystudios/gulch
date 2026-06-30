import { describe, expect, it } from "vitest";

import {
  getEventDetail,
  groupEventsByWeek,
  listUpcomingEvents,
  type EventListItem,
} from "./events";

type QueryResult = { data: unknown; error: unknown };

const makeBuilder = (result: QueryResult) => {
  const builder: Record<string, unknown> = {};
  for (const method of [
    "select",
    "gte",
    "eq",
    "order",
    "limit",
    "maybeSingle",
  ]) {
    builder[method] = () => builder;
  }
  builder.then = (resolve: (value: QueryResult) => unknown) => resolve(result);
  return builder;
};

const makeClient = (result: QueryResult) =>
  ({ from: () => makeBuilder(result) }) as never;

const baseRow = {
  webflow_item_id: "evt-1",
  name: "GULCH Mag Launch",
  start_at: "2026-07-01T00:00:00Z",
  end_at: null,
  image_url: "https://cdn.example.com/evt-1.jpg",
  image_status: "ok",
  tickets_required: true,
  external_link: "https://instagram.com/p/abc",
  locations: { name: "El Sótano" },
  event_organizers: [{ organizers: { name: "GULCH Magazine" } }],
};

describe("listUpcomingEvents", () => {
  it("maps rows with object-form relations", async () => {
    const result = await listUpcomingEvents(
      makeClient({ data: [baseRow], error: null }),
      {
        limit: 5,
        nowIso: "2026-06-30T00:00:00Z",
      },
    );

    expect(result).toEqual([
      {
        id: "evt-1",
        name: "GULCH Mag Launch",
        startAt: "2026-07-01T00:00:00Z",
        endAt: null,
        imageUrl: "https://cdn.example.com/evt-1.jpg",
        imageStatus: "ok",
        ticketsRequired: true,
        externalLink: "https://instagram.com/p/abc",
        organizerName: "GULCH Magazine",
        locationName: "El Sótano",
      },
    ]);
  });

  it("normalizes array-form relations and missing names", async () => {
    const rows = [
      {
        ...baseRow,
        webflow_item_id: "evt-2",
        locations: [{ name: "Echo Gallery" }],
        // first organizer has no record, second does — exercises the skip loop.
        event_organizers: [
          { organizers: null },
          { organizers: [{ name: "Echo Contemporary" }] },
        ],
      },
      {
        ...baseRow,
        webflow_item_id: "evt-3",
        image_url: null,
        tickets_required: false,
        locations: null,
        event_organizers: [],
      },
    ];

    const result = await listUpcomingEvents(
      makeClient({ data: rows, error: null }),
    );

    expect(result[0]?.locationName).toBe("Echo Gallery");
    expect(result[0]?.organizerName).toBe("Echo Contemporary");
    expect(result[1]?.locationName).toBeNull();
    expect(result[1]?.organizerName).toBeNull();
    expect(result[1]?.imageUrl).toBeNull();
  });

  it("returns an empty list when data is null", async () => {
    await expect(
      listUpcomingEvents(makeClient({ data: null, error: null })),
    ).resolves.toEqual([]);
  });

  it("throws when Supabase returns an error", async () => {
    const error = new Error("rls denied");
    await expect(
      listUpcomingEvents(makeClient({ data: null, error })),
    ).rejects.toThrow("rls denied");
  });
});

describe("getEventDetail", () => {
  it("maps a single event with its custom time description", async () => {
    const row = {
      ...baseRow,
      custom_time_description: "Doors at 6, show at 7",
    };

    const result = await getEventDetail(
      makeClient({ data: row, error: null }),
      "evt-1",
    );

    expect(result).toMatchObject({
      id: "evt-1",
      organizerName: "GULCH Magazine",
      locationName: "El Sótano",
      customTimeDescription: "Doors at 6, show at 7",
    });
  });

  it("returns null when the event is not found", async () => {
    await expect(
      getEventDetail(makeClient({ data: null, error: null }), "missing"),
    ).resolves.toBeNull();
  });

  it("throws when Supabase returns an error", async () => {
    const error = new Error("boom");
    await expect(
      getEventDetail(makeClient({ data: null, error }), "evt-1"),
    ).rejects.toThrow("boom");
  });
});

describe("groupEventsByWeek", () => {
  const mk = (id: string, startAt: string): EventListItem => ({
    id,
    name: id,
    startAt,
    endAt: null,
    imageUrl: null,
    imageStatus: "ok",
    ticketsRequired: false,
    externalLink: null,
    organizerName: null,
    locationName: null,
  });

  it("buckets events into week sections, oldest first", () => {
    const sections = groupEventsByWeek(
      [
        mk("a", "2025-06-05T17:00:00Z"), // week of Jun 1
        mk("b", "2025-06-12T17:00:00Z"), // week of Jun 8
        mk("c", "2025-06-06T17:00:00Z"), // week of Jun 1
      ],
      "UTC",
    );

    expect(sections).toEqual([
      {
        key: "2025-06-01",
        title: "Jun 1 – 7",
        data: [
          expect.objectContaining({ id: "a" }),
          expect.objectContaining({ id: "c" }),
        ],
      },
      {
        key: "2025-06-08",
        title: "Jun 8 – 14",
        data: [expect.objectContaining({ id: "b" })],
      },
    ]);
  });

  it("returns an empty array for no events", () => {
    expect(groupEventsByWeek([], "UTC")).toEqual([]);
  });
});
