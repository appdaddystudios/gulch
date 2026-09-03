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
  const live = { dealt: true, interactive: true, remaining: 3, focused: true };

  it("is true for a dealt, interactive, on-screen deck with cards left", () => {
    expect(isDeckHintable(live)).toBe(true);
    expect(isDeckHintable({ ...live, remaining: 1 })).toBe(true);
  });

  it("is false while Home is not the focused route", () => {
    expect(isDeckHintable({ ...live, focused: false })).toBe(false);
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
