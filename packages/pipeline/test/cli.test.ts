import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type FakeSupabaseClient = {
  readonly from: () => {
    readonly upsert: () => Promise<{ readonly error: null }>;
    readonly delete: () => {
      readonly not: () => Promise<{ readonly error: null }>;
    };
  };
};

let fakeDb: FakeSupabaseClient;

vi.mock("@gulch/db", () => ({
  createDbClient: vi.fn(() => fakeDb)
}));

const originalEnv = process.env;

const makeWebflowPage = (id: string) => ({
  cmsLocaleId: "locale-123",
  lastPublished: "2026-06-01T12:00:00.000Z",
  createdOn: "2026-05-01T12:00:00.000Z",
  isArchived: false,
  isDraft: false,
  id,
  lastUpdated: "2026-06-02T12:00:00.000Z",
  fieldData:
    id === "event-1"
      ? {
          name: "Event One",
          slug: "event-one",
          "start-date-time": "2026-07-01T12:00:00.000Z",
          "external-link": "https://example.com/event"
        }
      : id === "show-1"
        ? {
            name: "Show One",
            slug: "show-one"
          }
        : {
            name: "Location One",
            slug: "location-one",
            "plain-text-name-address": "10 Krog St NE"
          }
});

beforeEach(() => {
  process.env = { ...originalEnv };
  fakeDb = {
    from: () => ({
      upsert: async () => ({ error: null }),
      delete: () => ({
        not: async () => ({ error: null })
      })
    })
  };
});

afterEach(() => {
  process.env = originalEnv;
  vi.restoreAllMocks();
});

describe("parseCliEnv", () => {
  it("throws a clear error listing missing required variables", async () => {
    const { parseCliEnv } = await import("../src/cli");

    expect(() => parseCliEnv({})).toThrow(
      /Missing or invalid required seed environment variables: .*GULCH_WEBFLOW_API_KEY.*MAPBOX_TOKEN.*EXPO_PUBLIC_SUPABASE_URL.*SUPABASE_SERVICE_ROLE_KEY/s
    );
  });

  it("returns explicit env values without reading process.env", async () => {
    const { parseCliEnv } = await import("../src/cli");

    expect(
      parseCliEnv({
        GULCH_WEBFLOW_API_KEY: "wf-token",
        MAPBOX_TOKEN: "mapbox-token",
        EXPO_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role"
      })
    ).toEqual({
      GULCH_WEBFLOW_API_KEY: "wf-token",
      MAPBOX_TOKEN: "mapbox-token",
      EXPO_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role"
    });
  });

  it("runs main with injected env and mocked network/db dependencies", async () => {
    const { main } = await import("../src/cli");
    const logs: string[] = [];
    const originalFetch = globalThis.fetch;

    process.env = {
      GULCH_WEBFLOW_API_KEY: "wf-token",
      MAPBOX_TOKEN: "mapbox-token",
      EXPO_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role"
    };
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation((value?: unknown) => {
      logs.push(String(value));
    });
    globalThis.fetch = (async (input: string | URL) => {
      const url = new URL(String(input));
      if (url.hostname === "api.webflow.com") {
        const path = url.pathname;
        const item = path.includes("6843bee91e942f36fd3adc06")
          ? makeWebflowPage("location-1")
          : path.includes("6845d39c294d60e4c197cee9")
            ? makeWebflowPage("event-1")
            : makeWebflowPage("show-1");

        return new Response(
          JSON.stringify({
            items: [item],
            pagination: { limit: 100, offset: 0, total: 1 }
          })
        );
      }

      return new Response(JSON.stringify({ features: [{ center: [-84.371, 33.772], relevance: 1 }] }));
    }) as typeof globalThis.fetch;

    try {
      await main();
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(JSON.parse(logs[0] ?? "{}")).toMatchObject({
      locations: { fetched: 1, upserted: 1, geocoded: 1 },
      events: { fetched: 1, upserted: 1 },
      shows: { fetched: 1, upserted: 1 }
    });
  });
});
