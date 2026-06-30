import { describe, expect, it } from "vitest";

import { getCounts } from "./stats";

type TableName = "locations" | "events" | "shows";

const createClient = (counts: Record<TableName, number>) => ({
  from: (table: TableName) => ({
    select: async () => ({ count: counts[table], error: null })
  })
});

describe("getCounts", () => {
  it("loads counts for the mobile shell tables", async () => {
    await expect(getCounts(createClient({ locations: 3, events: 5, shows: 7 }) as never)).resolves.toEqual({
      locations: 3,
      events: 5,
      shows: 7
    });
  });

  it("defaults null counts to zero", async () => {
    const client = {
      from: () => ({
        select: async () => ({ count: null, error: null })
      })
    };

    await expect(getCounts(client as never)).resolves.toEqual({
      locations: 0,
      events: 0,
      shows: 0
    });
  });

  it("throws when Supabase returns an error", async () => {
    const error = new Error("rls denied");
    const client = {
      from: () => ({
        select: async () => ({ count: null, error })
      })
    };

    await expect(getCounts(client as never)).rejects.toThrow("rls denied");
  });
});
