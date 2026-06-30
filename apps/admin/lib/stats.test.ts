import { describe, expect, it } from "vitest";

import { getCounts, type CountClient } from "./stats";

const createCountClient = (counts: Record<string, number | null>): CountClient => {
  return {
    from: (table: string) =>
      ({
        select: (_columns: string, options: { readonly count: "exact"; readonly head: true }) => {
          expect(options).toEqual({ count: "exact", head: true });
          return Promise.resolve({ count: counts[table] ?? null, error: null });
        }
      }) as never
  };
};

describe("getCounts", () => {
  it("fetches exact head counts for admin tables", async () => {
    await expect(
      getCounts(
        createCountClient({
          locations: 12,
          events: 34,
          shows: 5
        })
      )
    ).resolves.toEqual({
      locations: 12,
      events: 34,
      shows: 5
    });
  });

  it("normalizes null counts to zero", async () => {
    await expect(getCounts(createCountClient({ locations: null, events: 1, shows: 2 }))).resolves.toEqual({
      locations: 0,
      events: 1,
      shows: 2
    });
  });

  it("throws table-specific errors when Supabase returns an error", async () => {
    const client = {
      from: (table: string) =>
        ({
          select: () =>
            Promise.resolve({
              count: null,
              error: table === "events" ? { message: "permission denied" } : null
            })
        }) as never
    };

    await expect(getCounts(client)).rejects.toThrow("Failed to count events: permission denied");
  });
});
