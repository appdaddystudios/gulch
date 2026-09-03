import { describe, expect, it } from "vitest";

import {
  EVENT_SELECT,
  getEventDetail,
  groupEventsByWeek,
  DECK_FETCH_MAX,
  listDeckEvents,
  listEventsByIds,
  listTrendingEvents,
  listUpcomingEvents,
  type EventListItem,
} from "./events";

type QueryResult = { data: unknown; error: unknown };

const makeBuilder = (result: QueryResult) => {
  const builder: Record<string, unknown> = {};
  for (const method of [
    "select",
    "gt",
    "gte",
    "eq",
    "in",
    "not",
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

// Same chainable shape, but records every call so query-shape tests can
// assert filters without a live PostgREST.
type RecordedCall = readonly [method: string, ...args: unknown[]];
const makeRecordingClient = (result: QueryResult) => {
  const calls: RecordedCall[] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "gte", "eq", "not", "order", "limit"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return builder;
    };
  }
  builder.then = (resolve: (value: QueryResult) => unknown) => resolve(result);
  const tables: string[] = [];
  const client = {
    from: (table: string) => {
      tables.push(table);
      return builder;
    },
  } as never;
  return { client, calls, tables };
};

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
        customTimeDescription: null,
        imageUrl: "https://cdn.example.com/evt-1.jpg",
        imageStatus: "ok",
        ticketsRequired: true,
        editorsPick: false,
        sponsored: false,
        saveCount: 0,
        isVideo: false,
        externalLink: "https://instagram.com/p/abc",
        organizerName: "GULCH Magazine",
        locationName: "El Sótano",
        latitude: null,
        longitude: null,
      },
    ]);
  });

  it("reads venue coordinates from the location embed", async () => {
    const row = {
      ...baseRow,
      locations: { name: "El Sótano", latitude: 33.7489, longitude: -84.3879 },
    };

    const result = await listUpcomingEvents(
      makeClient({ data: [row], error: null }),
    );

    expect(result[0]).toMatchObject({ latitude: 33.7489, longitude: -84.3879 });
  });

  it("defaults editorsPick to false and reads it when set", async () => {
    const def = await listUpcomingEvents(
      makeClient({ data: [baseRow], error: null }),
    );
    expect(def[0]?.editorsPick).toBe(false);

    const picked = await listUpcomingEvents(
      makeClient({ data: [{ ...baseRow, editors_pick: true }], error: null }),
    );
    expect(picked[0]?.editorsPick).toBe(true);
  });

  it("requests the editors_pick column", () => {
    expect(EVENT_SELECT).toContain("editors_pick");
  });

  it("defaults isVideo to false and reads it when set", async () => {
    const def = await listUpcomingEvents(
      makeClient({ data: [baseRow], error: null }),
    );
    expect(def[0]?.isVideo).toBe(false);

    const video = await listUpcomingEvents(
      makeClient({ data: [{ ...baseRow, is_video: true }], error: null }),
    );
    expect(video[0]?.isVideo).toBe(true);
  });

  it("requests the is_video column", () => {
    expect(EVENT_SELECT).toContain("is_video");
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

describe("listEventsByIds", () => {
  it("returns an empty array without querying when ids is empty", async () => {
    const client = {
      from: () => {
        throw new Error("should not query");
      },
    } as never;
    await expect(listEventsByIds(client, [])).resolves.toEqual([]);
  });

  it("maps matched rows", async () => {
    const result = await listEventsByIds(
      makeClient({ data: [baseRow], error: null }),
      ["evt-1"],
    );
    expect(result[0]?.id).toBe("evt-1");
  });

  it("throws when Supabase returns an error", async () => {
    const error = new Error("rls denied");
    await expect(
      listEventsByIds(makeClient({ data: null, error }), ["evt-1"]),
    ).rejects.toThrow("rls denied");
  });
});

describe("listTrendingEvents", () => {
  it("maps ranked rows and applies each row's save count", async () => {
    const client = makeClient({
      data: [{ saves: 4, events: baseRow }],
      error: null,
    });

    const result = await listTrendingEvents(client, {
      nowIso: "2026-06-01T00:00:00Z",
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("evt-1");
    expect(result[0]?.saveCount).toBe(4);
  });

  it("returns an empty list when no events have saves", async () => {
    const client = makeClient({ data: null, error: null });
    await expect(
      listTrendingEvents(client, { nowIso: "2026-06-01T00:00:00Z" }),
    ).resolves.toEqual([]);
  });

  it("throws when Supabase returns an error", async () => {
    const client = makeClient({ data: null, error: new Error("rls denied") });
    await expect(
      listTrendingEvents(client, { nowIso: "2026-06-01T00:00:00Z" }),
    ).rejects.toThrow("rls denied");
  });
});

describe("listDeckEvents", () => {
  it("queries upcoming events with a ready image, soonest first, capped", async () => {
    const { client, calls, tables } = makeRecordingClient({
      data: [baseRow],
      error: null,
    });

    await listDeckEvents(client, { limit: 7, nowIso: "2026-06-30T00:00:00Z" });

    expect(tables).toEqual(["events"]);
    expect(calls).toEqual([
      ["select", EVENT_SELECT],
      ["gte", "start_at", "2026-06-30T00:00:00Z"],
      ["eq", "image_status", "ok"],
      ["not", "image_url", "is", null],
      ["order", "start_at", { ascending: true }],
      ["limit", 7],
    ]);
  });

  it("fetches past the ids the deck will exclude", async () => {
    const { client, calls } = makeRecordingClient({ data: [], error: null });

    await listDeckEvents(client, { limit: 20, excludeCount: 15 });

    expect(calls).toContainEqual(["limit", 35]);
  });

  it("caps the over-fetch at DECK_FETCH_MAX", async () => {
    const { client, calls } = makeRecordingClient({ data: [], error: null });

    await listDeckEvents(client, { limit: 20, excludeCount: 5000 });

    expect(calls).toContainEqual(["limit", DECK_FETCH_MAX]);
  });

  it("defaults to a limit of 20 and the current time", async () => {
    const before = new Date().toISOString();
    const { client, calls } = makeRecordingClient({ data: [], error: null });

    await listDeckEvents(client);

    const gte = calls.find(([method]) => method === "gte");
    expect(gte?.[1]).toBe("start_at");
    expect(String(gte?.[2]) >= before).toBe(true);
    expect(calls.find(([method]) => method === "limit")).toEqual(["limit", 20]);
  });

  it("maps rows through the shared event schema", async () => {
    const result = await listDeckEvents(
      makeClient({ data: [{ ...baseRow, editors_pick: true }], error: null }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "evt-1",
      imageUrl: "https://cdn.example.com/evt-1.jpg",
      imageStatus: "ok",
      editorsPick: true,
      organizerName: "GULCH Magazine",
    });
  });

  it("returns an empty list when data is null", async () => {
    await expect(
      listDeckEvents(makeClient({ data: null, error: null })),
    ).resolves.toEqual([]);
  });

  it("throws when Supabase returns an error", async () => {
    await expect(
      listDeckEvents(makeClient({ data: null, error: new Error("rls denied") })),
    ).rejects.toThrow("rls denied");
  });
});

describe("groupEventsByWeek", () => {
  const mk = (id: string, startAt: string): EventListItem => ({
    id,
    name: id,
    startAt,
    endAt: null,
    customTimeDescription: null,
    sponsored: false,
    saveCount: 0,
    imageUrl: null,
    imageStatus: "ok",
    ticketsRequired: false,
    editorsPick: false,
    isVideo: false,
    externalLink: null,
    organizerName: null,
    locationName: null,
    latitude: null,
    longitude: null,
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
