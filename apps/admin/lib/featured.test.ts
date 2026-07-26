import { describe, expect, it } from "vitest";

import {
  addToList,
  getFeaturedState,
  moveInList,
  removeFromList,
  setFeaturedOrganizers,
  type FeaturedClient
} from "./featured";

describe("addToList", () => {
  it("appends a new id", () => {
    expect(addToList(["a"], "b")).toEqual(["a", "b"]);
  });

  it("is a no-op when the id is already present", () => {
    const list = ["a", "b"];
    expect(addToList(list, "a")).toBe(list);
  });
});

describe("removeFromList", () => {
  it("removes the id and keeps order", () => {
    expect(removeFromList(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });

  it("is a no-op for an absent id", () => {
    expect(removeFromList(["a"], "x")).toEqual(["a"]);
  });
});

describe("moveInList", () => {
  it("swaps up", () => {
    expect(moveInList(["a", "b", "c"], "b", "up")).toEqual(["b", "a", "c"]);
  });

  it("swaps down", () => {
    expect(moveInList(["a", "b", "c"], "b", "down")).toEqual(["a", "c", "b"]);
  });

  it("is a no-op at the top edge", () => {
    const list = ["a", "b"];
    expect(moveInList(list, "a", "up")).toBe(list);
  });

  it("is a no-op at the bottom edge", () => {
    const list = ["a", "b"];
    expect(moveInList(list, "b", "down")).toBe(list);
  });

  it("is a no-op for an absent id", () => {
    const list = ["a", "b"];
    expect(moveInList(list, "x", "up")).toBe(list);
  });
});

type QueryResult = { readonly data: unknown; readonly error: unknown };

type TableCall = {
  readonly table: string;
  readonly method: string;
  readonly args: readonly unknown[];
};

const makeClient = (results: Record<string, QueryResult>, calls: TableCall[] = []): FeaturedClient => {
  return {
    from: (table: string) => {
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "order", "delete", "gte", "insert"]) {
        builder[method] = (...args: unknown[]) => {
          calls.push({ table, method, args });
          return builder;
        };
      }
      builder.then = (resolve: (value: QueryResult) => unknown) =>
        resolve(results[table] ?? { data: null, error: null });
      return builder;
    }
  } as never;
};

describe("getFeaturedState", () => {
  it("merges the organizer list with the curated order", async () => {
    await expect(
      getFeaturedState(
        makeClient({
          organizers: {
            data: [
              { webflow_item_id: "org-1", name: "Alpha" },
              { webflow_item_id: "org-2", name: "Beta" }
            ],
            error: null
          },
          featured_organizers: {
            data: [{ organizer_id: "org-2", position: 0 }],
            error: null
          }
        })
      )
    ).resolves.toEqual({
      organizers: [
        { id: "org-1", name: "Alpha" },
        { id: "org-2", name: "Beta" }
      ],
      featuredIds: ["org-2"]
    });
  });

  it("returns empty lists when data is null", async () => {
    await expect(
      getFeaturedState(
        makeClient({
          organizers: { data: null, error: null },
          featured_organizers: { data: null, error: null }
        })
      )
    ).resolves.toEqual({ organizers: [], featuredIds: [] });
  });

  it("throws when either query fails", async () => {
    await expect(
      getFeaturedState(
        makeClient({
          organizers: { data: null, error: { message: "boom" } },
          featured_organizers: { data: [], error: null }
        })
      )
    ).rejects.toThrow("Failed to load organizers: boom");
  });
});

describe("setFeaturedOrganizers", () => {
  it("rewrites the curation with 0-based positions", async () => {
    const calls: TableCall[] = [];

    await expect(
      setFeaturedOrganizers(
        makeClient({ featured_organizers: { data: null, error: null } }, calls),
        ["org-2", "org-1"]
      )
    ).resolves.toBeUndefined();

    expect(calls).toEqual([
      { table: "featured_organizers", method: "delete", args: [] },
      { table: "featured_organizers", method: "gte", args: ["position", -1] },
      {
        table: "featured_organizers",
        method: "insert",
        args: [
          [
            { organizer_id: "org-2", position: 0 },
            { organizer_id: "org-1", position: 1 }
          ]
        ]
      }
    ]);
  });

  it("only deletes when the new list is empty", async () => {
    const calls: TableCall[] = [];

    await expect(
      setFeaturedOrganizers(makeClient({ featured_organizers: { data: null, error: null } }, calls), [])
    ).resolves.toBeUndefined();

    expect(calls.map((call) => call.method)).toEqual(["delete", "gte"]);
  });

  it("throws when the write fails", async () => {
    await expect(
      setFeaturedOrganizers(
        makeClient({ featured_organizers: { data: null, error: { message: "denied" } } }),
        ["org-1"]
      )
    ).rejects.toThrow("Failed to update featured organizers: denied");
  });
});
