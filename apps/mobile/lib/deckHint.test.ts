import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
const getItem = vi.fn(async (key: string) => store.get(key) ?? null);
const setItem = vi.fn(async (key: string, value: string) => {
  store.set(key, value);
});

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: (key: string) => getItem(key),
    setItem: (key: string, value: string) => setItem(key, value),
  },
}));

import {
  DECK_HINT_KEY,
  hasSeenDeckHint,
  isDeckHintable,
  isFrameInViewport,
  markDeckHintSeen,
  shouldRunDeckHint,
  type DeckHintInput,
} from "./deckHint";

beforeEach(() => {
  store.clear();
  getItem.mockClear();
  setItem.mockClear();
  getItem.mockImplementation(async (key: string) => store.get(key) ?? null);
  setItem.mockImplementation(async (key: string, value: string) => {
    store.set(key, value);
  });
});

describe("isDeckHintable", () => {
  const live = {
    dealt: true,
    interactive: true,
    remaining: 3,
    focused: true,
    foreground: true,
    visible: true,
  };

  it("is true for a dealt, interactive, on-screen deck with cards left", () => {
    expect(isDeckHintable(live)).toBe(true);
    expect(isDeckHintable({ ...live, remaining: 1 })).toBe(true);
  });

  it("is false while Home is not the focused route", () => {
    expect(isDeckHintable({ ...live, focused: false })).toBe(false);
  });

  it("is false while the app is backgrounded", () => {
    expect(isDeckHintable({ ...live, foreground: false })).toBe(false);
  });

  it("is false while the deck is scrolled out of the viewport", () => {
    expect(isDeckHintable({ ...live, visible: false })).toBe(false);
  });

  it("is false while nothing is dealt", () => {
    expect(isDeckHintable({ ...live, dealt: false })).toBe(false);
  });

  it("is false while the deck is inert", () => {
    expect(isDeckHintable({ ...live, interactive: false })).toBe(false);
  });

  it("is false once every card has left the deck", () => {
    expect(isDeckHintable({ ...live, remaining: 0 })).toBe(false);
  });
});

describe("isFrameInViewport", () => {
  const deck = { y: 100, height: 400 };

  it("is false before the deck or the viewport has been measured", () => {
    expect(isFrameInViewport(null, 0, 800)).toBe(false);
    expect(isFrameInViewport(deck, 0, 0)).toBe(false);
  });

  it("is true when the deck is fully or partly inside the viewport", () => {
    expect(isFrameInViewport(deck, 0, 800)).toBe(true);
    expect(isFrameInViewport(deck, 450, 800)).toBe(true); // bottom edge peeks
    expect(isFrameInViewport(deck, 0, 150)).toBe(true); // top edge peeks
  });

  it("is false once the deck is entirely above or below the viewport", () => {
    expect(isFrameInViewport(deck, 500, 800)).toBe(false); // scrolled past
    expect(isFrameInViewport(deck, 0, 100)).toBe(false); // not reached yet
  });
});

describe("shouldRunDeckHint", () => {
  const base: DeckHintInput = {
    seen: false,
    hintable: true,
    reduceMotion: false,
  };

  it("runs on a fresh, hintable deck", () => {
    expect(shouldRunDeckHint(base)).toBe("run");
  });

  it("only marks when Reduce Motion is on", () => {
    expect(shouldRunDeckHint({ ...base, reduceMotion: true })).toBe("mark-only");
  });

  it("skips once the hint has been seen", () => {
    expect(shouldRunDeckHint({ ...base, seen: true })).toBe("skip");
    expect(shouldRunDeckHint({ ...base, seen: true, reduceMotion: true })).toBe(
      "skip",
    );
  });

  it("skips — and does not mark — when no card can be nudged", () => {
    expect(shouldRunDeckHint({ ...base, hintable: false })).toBe("skip");
    expect(
      shouldRunDeckHint({ ...base, hintable: false, reduceMotion: true }),
    ).toBe("skip");
  });
});

describe("hasSeenDeckHint", () => {
  it("is false when the flag is absent", async () => {
    expect(await hasSeenDeckHint()).toBe(false);
    expect(getItem).toHaveBeenCalledWith(DECK_HINT_KEY);
  });

  it("is true once the flag is written", async () => {
    store.set(DECK_HINT_KEY, "1");
    expect(await hasSeenDeckHint()).toBe(true);
  });

  it("treats any other stored value as unseen", async () => {
    store.set(DECK_HINT_KEY, "yes");
    expect(await hasSeenDeckHint()).toBe(false);
  });

  it("fails closed (seen) when storage throws", async () => {
    getItem.mockRejectedValueOnce(new Error("disk"));
    expect(await hasSeenDeckHint()).toBe(true);
  });
});

describe("markDeckHintSeen", () => {
  it("writes the flag under the versioned key", async () => {
    await markDeckHintSeen();
    expect(setItem).toHaveBeenCalledWith(DECK_HINT_KEY, "1");
    expect(await hasSeenDeckHint()).toBe(true);
  });

  it("swallows storage errors", async () => {
    setItem.mockRejectedValueOnce(new Error("disk"));
    await expect(markDeckHintSeen()).resolves.toBeUndefined();
  });
});
