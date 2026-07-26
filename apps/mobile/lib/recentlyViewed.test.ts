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
  getRecentlyViewedIds,
  parseRecentIds,
  RECENTLY_VIEWED_KEY,
  recordRecentlyViewed,
} from "./recentlyViewed";

beforeEach(() => {
  store.clear();
  getItem.mockClear();
  setItem.mockClear();
});

describe("parseRecentIds", () => {
  it("parses a JSON array of ids", () => {
    expect(parseRecentIds('["a","b"]')).toEqual(["a", "b"]);
  });

  it("returns an empty array for null", () => {
    expect(parseRecentIds(null)).toEqual([]);
  });

  it("drops non-string entries", () => {
    expect(parseRecentIds('["a",1,null,"b"]')).toEqual(["a", "b"]);
  });

  it("returns an empty array for non-array JSON", () => {
    expect(parseRecentIds('{"a":1}')).toEqual([]);
  });

  it("returns an empty array for malformed JSON", () => {
    expect(parseRecentIds("not json")).toEqual([]);
  });
});

describe("recordRecentlyViewed", () => {
  it("prepends new ids most-recent-first", async () => {
    await recordRecentlyViewed("a");
    await recordRecentlyViewed("b");
    expect(await getRecentlyViewedIds()).toEqual(["b", "a"]);
  });

  it("moves a re-viewed id to the front without duplicating", async () => {
    await recordRecentlyViewed("a");
    await recordRecentlyViewed("b");
    await recordRecentlyViewed("a");
    expect(await getRecentlyViewedIds()).toEqual(["a", "b"]);
  });

  it("caps history at 20 entries", async () => {
    for (let index = 0; index < 25; index += 1) {
      await recordRecentlyViewed(`id-${index}`);
    }
    const ids = await getRecentlyViewedIds();
    expect(ids).toHaveLength(20);
    expect(ids[0]).toBe("id-24");
    expect(ids).not.toContain("id-4");
  });

  it("swallows storage write errors", async () => {
    setItem.mockRejectedValueOnce(new Error("disk full"));
    await expect(recordRecentlyViewed("a")).resolves.toBeUndefined();
  });
});

describe("getRecentlyViewedIds", () => {
  it("reads ids from storage under the versioned key", async () => {
    store.set(RECENTLY_VIEWED_KEY, '["x"]');
    expect(await getRecentlyViewedIds()).toEqual(["x"]);
  });

  it("returns an empty array when storage read fails", async () => {
    getItem.mockRejectedValueOnce(new Error("nope"));
    expect(await getRecentlyViewedIds()).toEqual([]);
  });
});
