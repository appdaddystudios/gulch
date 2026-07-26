import { describe, expect, it } from "vitest";

import { getSponsorableEvents, setEventSponsored } from "./sponsoredEvents";

type QueryResult = { readonly data: unknown; readonly error: unknown };

type TableCall = {
  readonly table: string;
  readonly method: string;
  readonly args: readonly unknown[];
};

const makeClient = (results: Record<string, QueryResult>, calls: TableCall[] = []) => {
  return {
    from: (table: string) => {
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "order", "gte", "limit", "update", "eq"]) {
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

describe("getSponsorableEvents", () => {
  it("maps rows to sponsorable events", async () => {
    const client = makeClient({
      events: {
        data: [
          {
            webflow_item_id: "evt-1",
            name: "Launch Party",
            start_at: "2026-08-01T00:00:00Z",
            sponsored: true
          }
        ],
        error: null
      }
    });

    await expect(getSponsorableEvents(client)).resolves.toEqual([
      {
        id: "evt-1",
        name: "Launch Party",
        startAt: "2026-08-01T00:00:00Z",
        sponsored: true
      }
    ]);
  });

  it("returns an empty list when data is null", async () => {
    const client = makeClient({ events: { data: null, error: null } });
    await expect(getSponsorableEvents(client)).resolves.toEqual([]);
  });

  it("throws when Supabase returns an error", async () => {
    const client = makeClient({
      events: { data: null, error: new Error("rls denied") }
    });
    await expect(getSponsorableEvents(client)).rejects.toThrow("rls denied");
  });
});

describe("setEventSponsored", () => {
  it("updates the sponsored flag for the given event", async () => {
    const calls: TableCall[] = [];
    const client = makeClient({ events: { data: null, error: null } }, calls);

    await setEventSponsored(client, "evt-1", true);

    expect(calls).toEqual([
      { table: "events", method: "update", args: [{ sponsored: true }] },
      { table: "events", method: "eq", args: ["webflow_item_id", "evt-1"] }
    ]);
  });

  it("throws when the update fails", async () => {
    const client = makeClient({
      events: { data: null, error: new Error("denied") }
    });
    await expect(setEventSponsored(client, "evt-1", false)).rejects.toThrow(
      "denied"
    );
  });
});
