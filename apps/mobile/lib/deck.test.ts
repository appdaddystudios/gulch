import { describe, expect, it } from "vitest";

import {
  buildDeck,
  compact,
  DECK_CAP,
  DECK_WINDOW,
  isDeckEligible,
  remaining,
  swipeLeft,
  swipeRight,
  topEntry,
  type DeckState,
} from "./deck";
import type { EventImageStatus, EventListItem } from "./events";

const mk = (
  id: string,
  overrides: Partial<EventListItem> = {},
): EventListItem => ({
  id,
  name: id,
  startAt: "2026-09-01T00:00:00Z",
  endAt: null,
  customTimeDescription: null,
  imageUrl: `https://cdn.example.com/${id}.jpg`,
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

const many = (n: number): EventListItem[] =>
  Array.from({ length: n }, (_, i) => mk(`e${i}`));

const ids = (state: DeckState): string[] =>
  state.entries.slice(state.head).map((entry) => entry.event.id);

const none: ReadonlySet<string> = new Set();

describe("isDeckEligible", () => {
  it("accepts image_status ok with a url", () => {
    expect(isDeckEligible(mk("a"))).toBe(true);
  });

  it.each<EventImageStatus>(["pending", "failed", "unavailable"])(
    "rejects image_status %s",
    (imageStatus) => {
      expect(isDeckEligible(mk("a", { imageStatus }))).toBe(false);
    },
  );

  it("rejects a missing or empty url even when status is ok", () => {
    expect(isDeckEligible(mk("a", { imageUrl: null }))).toBe(false);
    expect(isDeckEligible(mk("a", { imageUrl: "" }))).toBe(false);
  });
});

describe("buildDeck", () => {
  it("keeps only image-ready events, in input order, at pass 0", () => {
    const state = buildDeck(
      [
        mk("a"),
        mk("b", { imageStatus: "pending" }),
        mk("c", { imageUrl: null }),
        mk("d", { imageStatus: "failed" }),
        mk("e"),
      ],
      none,
    );

    expect(ids(state)).toEqual(["a", "e"]);
    expect(state.entries.map((entry) => entry.pass)).toEqual([0, 0]);
    expect(state.entries.map((entry) => entry.key)).toEqual(["a:0", "e:0"]);
    expect(state.head).toBe(0);
    expect(state.deckKey).toBe(0);
  });

  it("excludes events already saved at load", () => {
    const state = buildDeck([mk("a"), mk("b"), mk("c")], new Set(["b"]));
    expect(ids(state)).toEqual(["a", "c"]);
  });

  it("caps at DECK_CAP by default and honors a custom cap", () => {
    expect(buildDeck(many(30), none).entries).toHaveLength(DECK_CAP);
    expect(buildDeck(many(30), none, 5).entries).toHaveLength(5);
    expect(ids(buildDeck(many(30), none, 5))).toEqual([
      "e0",
      "e1",
      "e2",
      "e3",
      "e4",
    ]);
  });

  it("applies the cap after filtering, not before", () => {
    const events = [mk("skip", { imageUrl: null }), ...many(3)];
    expect(ids(buildDeck(events, none, 3))).toEqual(["e0", "e1", "e2"]);
  });

  it("returns an empty deck for no events", () => {
    const state = buildDeck([], none);
    expect(state.entries).toEqual([]);
    expect(remaining(state)).toBe(0);
    expect(topEntry(state)).toBeNull();
  });

  it("does not mutate its inputs", () => {
    const events = [mk("a"), mk("b")];
    const snapshot = structuredClone(events);
    const saved = new Set(["b"]);
    buildDeck(events, saved);
    expect(events).toEqual(snapshot);
    expect([...saved]).toEqual(["b"]);
  });
});

describe("swipeLeft", () => {
  it("moves the top card to the bottom as a re-keyed copy with pass + 1", () => {
    const before = buildDeck([mk("a"), mk("b"), mk("c")], none);
    const after = swipeLeft(before);

    expect(after.head).toBe(1);
    expect(after.entries).toHaveLength(4);
    expect(ids(after)).toEqual(["b", "c", "a"]);
    expect(after.entries[3]).toEqual({ key: "a:1", event: before.entries[0]?.event, pass: 1 });
    expect(remaining(after)).toBe(3);
  });

  it("keeps keys unique across repeated skips of the same card", () => {
    let state = buildDeck([mk("a")], none);
    state = swipeLeft(swipeLeft(swipeLeft(state)));
    const keys = state.entries.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(["a:0", "a:1", "a:2", "a:3"]);
    expect(topEntry(state)?.pass).toBe(3);
  });

  it("is a no-op on an exhausted deck", () => {
    const state = buildDeck([], none);
    expect(swipeLeft(state)).toBe(state);
  });

  it("does not mutate the previous state", () => {
    const before = buildDeck([mk("a"), mk("b")], none);
    const snapshot = structuredClone(before);
    swipeLeft(before);
    expect(before).toEqual(snapshot);
  });
});

describe("swipeRight", () => {
  it("advances the head and appends nothing", () => {
    const before = buildDeck([mk("a"), mk("b")], none);
    const after = swipeRight(before);

    expect(after.head).toBe(1);
    expect(after.entries).toBe(before.entries);
    expect(ids(after)).toEqual(["b"]);
    expect(after.deckKey).toBe(0);
  });

  it("is a no-op on an exhausted deck", () => {
    const state = swipeRight(buildDeck([mk("a")], none));
    expect(remaining(state)).toBe(0);
    expect(swipeRight(state)).toBe(state);
  });

  it("does not mutate the previous state", () => {
    const before = buildDeck([mk("a")], none);
    const snapshot = structuredClone(before);
    swipeRight(before);
    expect(before).toEqual(snapshot);
  });
});

describe("remaining / topEntry", () => {
  it("hits 0 only once every card has been saved", () => {
    let state = buildDeck(many(3), none);
    state = swipeLeft(state); // e0 recycled
    expect(remaining(state)).toBe(3);
    state = swipeRight(state); // e1 saved
    expect(remaining(state)).toBe(2);
    state = swipeRight(state); // e2 saved
    expect(remaining(state)).toBe(1);
    expect(topEntry(state)?.event.id).toBe("e0");
    state = swipeRight(state); // e0 saved
    expect(remaining(state)).toBe(0);
    expect(topEntry(state)).toBeNull();
  });
});

describe("compact", () => {
  const advanceLeft = (state: DeckState, n: number): DeckState => {
    let next = state;
    for (let i = 0; i < n; i += 1) {
      next = swipeLeft(next);
    }
    return next;
  };

  it("returns the same state object below DECK_WINDOW", () => {
    const state = advanceLeft(buildDeck(many(5), none), DECK_WINDOW - 1);
    expect(compact(state)).toBe(state);
  });

  it("slices the consumed prefix, resets head and bumps deckKey at DECK_WINDOW", () => {
    const state = advanceLeft(buildDeck(many(5), none), DECK_WINDOW);
    const orderBefore = ids(state);
    const compacted = compact(state);

    expect(compacted).not.toBe(state);
    expect(compacted.head).toBe(0);
    expect(compacted.deckKey).toBe(1);
    expect(compacted.entries).toHaveLength(5);
    expect(ids(compacted)).toEqual(orderBefore);
    expect(compacted.entries[0]?.key).toBe(state.entries[DECK_WINDOW]?.key);
  });

  it("bounds mounted entries to cap + window over a long session", () => {
    let state = buildDeck(many(DECK_CAP), none);
    let maxMounted = 0;
    for (let i = 0; i < 500; i += 1) {
      state = compact(swipeLeft(state));
      maxMounted = Math.max(maxMounted, state.entries.length);
    }
    expect(maxMounted).toBeLessThanOrEqual(DECK_CAP + DECK_WINDOW);
    expect(remaining(state)).toBe(DECK_CAP);
    expect(state.deckKey).toBeGreaterThan(0);
  });

  it("does not mutate the previous state", () => {
    const state = advanceLeft(buildDeck(many(2), none), DECK_WINDOW);
    const snapshot = structuredClone(state);
    compact(state);
    expect(state).toEqual(snapshot);
  });
});

describe("full cycle", () => {
  it("returns N skipped cards in their original order after N left swipes", () => {
    const n = 7;
    const start = buildDeck(many(n), none);
    const original = ids(start);

    let state = start;
    for (let i = 0; i < n; i += 1) {
      state = swipeLeft(state);
    }

    expect(ids(state)).toEqual(original);
    expect(state.entries.slice(state.head).every((entry) => entry.pass === 1)).toBe(true);
    expect(remaining(state)).toBe(n);
  });

  it("survives compaction mid-cycle with order intact", () => {
    const n = DECK_CAP;
    const start = buildDeck(many(n), none);
    const original = ids(start);

    let state = start;
    // Two full passes → head reaches DECK_WINDOW exactly once.
    for (let i = 0; i < 2 * n; i += 1) {
      state = compact(swipeLeft(state));
    }

    expect(ids(state)).toEqual(original);
    expect(state.deckKey).toBe(1);
    expect(state.head).toBe(0);
  });
});
