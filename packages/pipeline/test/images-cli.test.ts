import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ImagesEvent } from "../src/images";

type FakeSupabase = {
  readonly from: (table: "events") => {
    readonly select: (columns: string) => {
      readonly in: (
        column: string,
        values: readonly string[]
      ) => Promise<{ readonly data: readonly ImagesEvent[] | null; readonly error: null | { readonly message: string } }>;
      readonly not: (
        column: string,
        operator: string,
        value: null
      ) => Promise<{ readonly data: readonly ImagesEvent[] | null; readonly error: null | { readonly message: string } }>;
    };
    readonly update: (values: unknown) => {
      readonly eq: (column: string, value: string) => Promise<{ readonly error: null | { readonly message: string } }>;
    };
  };
  readonly storage: {
    readonly from: (bucket: "event-images") => {
      readonly upload: (
        path: string,
        bytes: Uint8Array,
        options: { readonly contentType: string; readonly upsert: true }
      ) => Promise<{ readonly error: null | { readonly message: string } }>;
      readonly getPublicUrl: (path: string) => { readonly data: { readonly publicUrl: string } };
    };
  };
};

let fakeSupabase: FakeSupabase;
let selectedFilters: string[];
let updates: { readonly values: unknown; readonly column: string; readonly value: string }[];
let uploads: {
  readonly path: string;
  readonly bytes: Uint8Array;
  readonly options: { readonly contentType: string; readonly upsert: true };
}[];
let selectError: string | null;
let updateError: string | null;
let uploadError: string | null;

vi.mock("@gulch/db", () => ({
  createDbClient: vi.fn(() => fakeSupabase)
}));

const originalEnv = process.env;

beforeEach(() => {
  process.env = { ...originalEnv };
  selectedFilters = [];
  updates = [];
  uploads = [];
  selectError = null;
  updateError = null;
  uploadError = null;
  fakeSupabase = {
    from: () => ({
      select: () => ({
        in: async (column, values) => {
          selectedFilters.push(`${column}:${values.join(",")}`);
          if (selectError) {
            return { data: null, error: { message: selectError } };
          }
          return {
            data: [
              {
                webflow_item_id: "non-ig-event",
                external_link: "https://example.com/event",
                image_checksum: null,
                image_status: "pending"
              }
            ],
            error: null
          };
        },
        not: async (column, operator, value) => {
          selectedFilters.push(`${column}:${operator}:${String(value)}`);
          if (selectError) {
            return { data: null, error: { message: selectError } };
          }
          return { data: [], error: null };
        }
      }),
      update: (values) => ({
        eq: async (column, value) => {
          updates.push({ values, column, value });
          if (updateError) {
            return { error: { message: updateError } };
          }
          return { error: null };
        }
      })
    }),
    storage: {
      from: () => ({
        upload: async (path, bytes, options) => {
          uploads.push({ path, bytes, options });
          if (uploadError) {
            return { error: { message: uploadError } };
          }
          return { error: null };
        },
        getPublicUrl: (path) => ({ data: { publicUrl: `https://cdn.test/${path}` } })
      })
    }
  };
});

afterEach(() => {
  process.env = originalEnv;
  vi.restoreAllMocks();
});

describe("parseImagesCliEnv", () => {
  it("throws a clear error listing missing required variables", async () => {
    const { parseImagesCliEnv } = await import("../src/images-cli");

    expect(() => parseImagesCliEnv({})).toThrow(
      /Missing or invalid required image environment variables: .*EXPO_PUBLIC_SUPABASE_URL.*SUPABASE_SERVICE_ROLE_KEY/s
    );
  });

  it("throws clear adapter errors for select, update, and upload failures", async () => {
    const { createImagesDbClient, createStorageClient } = await import("../src/images-cli");
    const db = createImagesDbClient(fakeSupabase);
    const storage = createStorageClient(fakeSupabase);

    selectError = "read denied";
    await expect(db.selectPendingEvents()).rejects.toThrow(/Failed to load image events: read denied/);

    selectError = null;
    updateError = "write denied";
    await expect(
      db.updateEventImage("event-1", {
        image_status: "failed",
        image_fetched_at: "2026-06-30T12:00:00.000Z"
      })
    ).rejects.toThrow(/Failed to update event image event-1: write denied/);

    uploadError = "bucket denied";
    await expect(storage.uploadEventImage("event-1", new Uint8Array([1]), "image/jpeg")).rejects.toThrow(
      /Failed to upload event image event-1: bucket denied/
    );
  });

  it("returns explicit env values without reading process.env", async () => {
    const { parseImagesCliEnv } = await import("../src/images-cli");

    expect(
      parseImagesCliEnv({
        EXPO_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role"
      })
    ).toEqual({
      EXPO_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role"
    });
  });
});

describe("images CLI adapters", () => {
  it("selects pending and failed events, updates event images, and uploads to the event-images bucket", async () => {
    const { createImagesDbClient, createStorageClient } = await import("../src/images-cli");
    const db = createImagesDbClient(fakeSupabase);
    const storage = createStorageClient(fakeSupabase);

    await expect(db.selectPendingEvents()).resolves.toEqual([
      {
        webflow_item_id: "non-ig-event",
        external_link: "https://example.com/event",
        image_checksum: null,
        image_status: "pending"
      }
    ]);
    await db.updateEventImage("non-ig-event", {
      image_url: null,
      image_status: "unavailable",
      image_fetched_at: "2026-06-30T12:00:00.000Z"
    });
    await expect(storage.uploadEventImage("non-ig-event", new Uint8Array([1]), "image/jpeg")).resolves.toBe(
      "https://cdn.test/events/non-ig-event.jpg"
    );

    expect(selectedFilters).toEqual(["image_status:pending,failed"]);
    expect(updates).toEqual([
      {
        column: "webflow_item_id",
        value: "non-ig-event",
        values: {
          image_url: null,
          image_status: "unavailable",
          image_fetched_at: "2026-06-30T12:00:00.000Z"
        }
      }
    ]);
    expect(uploads).toEqual([
      {
        path: "events/non-ig-event.jpg",
        bytes: new Uint8Array([1]),
        options: { contentType: "image/jpeg", upsert: true }
      }
    ]);
  });

  it("selects all events when refresh is enabled and runs main without hitting Instagram for non-IG events", async () => {
    const { createImagesDbClient, main } = await import("../src/images-cli");
    const logs: string[] = [];

    process.env = {
      EXPO_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role"
    };
    vi.spyOn(console, "log").mockImplementation((value?: unknown) => {
      logs.push(String(value));
    });

    await expect(createImagesDbClient(fakeSupabase).selectPendingEvents(true)).resolves.toEqual([]);
    await main();

    expect(selectedFilters).toEqual(["webflow_item_id:is:null", "image_status:pending,failed"]);
    expect(JSON.parse(logs[0] ?? "{}")).toEqual({
      scanned: 1,
      fetched: 0,
      unavailable: 1,
      failed: 0,
      skipped: 0
    });
  });
});
