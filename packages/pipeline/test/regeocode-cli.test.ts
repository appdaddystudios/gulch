import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RegeocodeDbClient } from "../src/regeocode";

let fakeDb: RegeocodeDbClient;

vi.mock("@gulch/db", () => ({
  createDbClient: vi.fn(() => fakeDb)
}));

const originalEnv = process.env;

beforeEach(() => {
  process.env = { ...originalEnv };
  fakeDb = {
    from: () => ({
      select: () => ({
        eq: () => ({
          not: async () => ({
            data: [{ webflow_item_id: "fixed-location", name_address: "10 Krog St NE" }],
            error: null
          })
        })
      }),
      update: () => ({
        eq: async () => ({ error: null })
      })
    })
  };
});

afterEach(() => {
  process.env = originalEnv;
  vi.restoreAllMocks();
});

describe("parseRegeocodeCliEnv", () => {
  it("throws a clear error listing missing required variables", async () => {
    const { parseRegeocodeCliEnv } = await import("../src/regeocode-cli");

    expect(() => parseRegeocodeCliEnv({})).toThrow(
      /Missing or invalid required re-geocode environment variables: .*EXPO_PUBLIC_SUPABASE_URL.*SUPABASE_SERVICE_ROLE_KEY.*MAPBOX_TOKEN/s
    );
  });

  it("returns explicit env values without reading process.env", async () => {
    const { parseRegeocodeCliEnv } = await import("../src/regeocode-cli");

    expect(
      parseRegeocodeCliEnv({
        EXPO_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role",
        MAPBOX_TOKEN: "mapbox-token"
      })
    ).toEqual({
      EXPO_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role",
      MAPBOX_TOKEN: "mapbox-token"
    });
  });

  it("runs main with mocked network and db dependencies", async () => {
    const { main } = await import("../src/regeocode-cli");
    const logs: string[] = [];
    const originalFetch = globalThis.fetch;

    process.env = {
      EXPO_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role",
      MAPBOX_TOKEN: "mapbox-token"
    };
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation((value?: unknown) => {
      logs.push(String(value));
    });
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ features: [{ center: [-84.371, 33.772], relevance: 1 }] }))) as typeof globalThis.fetch;

    try {
      await main();
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(JSON.parse(logs[0] ?? "{}")).toEqual({ scanned: 1, fixed: 1, stillFailed: 0 });
  });
});
