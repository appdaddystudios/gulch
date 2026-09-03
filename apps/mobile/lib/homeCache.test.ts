import { describe, expect, it } from "vitest";

import type { EventListItem } from "./events";
import { mergeById, missingIds, pickEvents } from "./homeCache";

const mk = (
  id: string,
  overrides: Partial<EventListItem> = {},
): EventListItem => ({
  id,
  name: id,
  startAt: "2026-09-01T00:00:00Z",
  endAt: null,
  customTimeDescription: null,
  imageUrl: null,
  imageStatus: "ok",
  ticketsRequired: false,
  editorsPick: false,
  sponsored: false,
  saveCount: 0,
  isVideo: false,
  externalLink: null,
  organizerName: null,
  locationName: null,
  latitude: null,
  longitude: null,
  ...overrides,
});

const mapOf = (...events: readonly EventListItem[]) =>
  new Map(events.map((event) => [event.id, event]));

describe("missingIds", () => {
  it("returns nothing for an empty wanted list", () => {
    expect(missingIds([], mapOf(mk("a")))).toEqual([]);
  });

  it("returns nothing when every id is already known", () => {
    expect(missingIds(["a", "b"], mapOf(mk("a"), mk("b")))).toEqual([]);
  });

  it("returns every id when no index is given", () => {
    expect(missingIds(["a", "b"])).toEqual(["a", "b"]);
  });

  it("treats ids split across several indexes as known", () => {
    const result = missingIds(
      ["a", "b", "c", "d"],
      mapOf(mk("a")),
      new Set(["b"]),
      mapOf(mk("d")),
    );
    expect(result).toEqual(["c"]);
  });

  it("dedupes duplicate wanted ids, keeping first-seen order", () => {
    expect(missingIds(["b", "a", "b", "a"], mapOf())).toEqual(["b", "a"]);
  });
});

describe("mergeById", () => {
  const baseA = mk("a", { name: "base a" });
  const extraA = mk("a", { name: "extra a" });

  it("lets base win when the same id is in both maps", () => {
    const merged = mergeById(mapOf(baseA), mapOf(extraA, mk("b")));
    expect(merged.get("a")?.name).toBe("base a");
    expect(merged.get("b")?.id).toBe("b");
    expect(merged.size).toBe(2);
  });

  it("still lets base win when the arguments carry the swapped rows", () => {
    const merged = mergeById(mapOf(extraA), mapOf(baseA));
    expect(merged.get("a")?.name).toBe("extra a");
  });

  it("returns a new map and leaves the inputs untouched", () => {
    const base = mapOf(baseA);
    const extra = mapOf(mk("b"));
    const merged = mergeById(base, extra);
    expect(merged).not.toBe(base);
    expect(base.size).toBe(1);
    expect(extra.size).toBe(1);
  });
});

describe("pickEvents", () => {
  const late = mk("late", { startAt: "2026-09-03T00:00:00Z" });
  const early = mk("early", { startAt: "2026-09-01T00:00:00Z" });
  const mid1 = mk("mid1", { startAt: "2026-09-02T00:00:00Z" });
  const mid2 = mk("mid2", { startAt: "2026-09-02T00:00:00Z" });
  const byId = mapOf(late, early, mid1, mid2);

  it("orders soonest first", () => {
    const picked = pickEvents(["late", "early"], byId, {
      order: "soonest",
      limit: 10,
    });
    expect(picked.map((event) => event.id)).toEqual(["early", "late"]);
  });

  it("keeps the given order for equal startAt when ordering soonest", () => {
    const picked = pickEvents(["mid2", "mid1", "early"], byId, {
      order: "soonest",
      limit: 10,
    });
    expect(picked.map((event) => event.id)).toEqual(["early", "mid2", "mid1"]);
  });

  it("keeps the given order when asked to", () => {
    const picked = pickEvents(["late", "early", "mid1"], byId, {
      order: "given",
      limit: 10,
    });
    expect(picked.map((event) => event.id)).toEqual(["late", "early", "mid1"]);
  });

  it("returns nothing for limit 0", () => {
    expect(pickEvents(["early"], byId, { order: "given", limit: 0 })).toEqual(
      [],
    );
  });

  it("caps the result at the limit after ordering", () => {
    const picked = pickEvents(["late", "mid1", "early"], byId, {
      order: "soonest",
      limit: 2,
    });
    expect(picked.map((event) => event.id)).toEqual(["early", "mid1"]);
  });

  it("skips ids absent from the map", () => {
    const picked = pickEvents(["missing", "early", "gone"], byId, {
      order: "given",
      limit: 10,
    });
    expect(picked.map((event) => event.id)).toEqual(["early"]);
  });

  it("dedupes repeated ids", () => {
    const picked = pickEvents(["early", "early"], byId, {
      order: "given",
      limit: 10,
    });
    expect(picked).toHaveLength(1);
  });
});
