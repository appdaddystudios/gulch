import { describe, expect, it } from "vitest";

import { runImages, type ImagesDbClient, type ImagesEvent, type StorageClient } from "../src/images";
import type { CoverResult } from "../src/image-fetcher";

const okResult = (checksum: string, bytes = new Uint8Array([1, 2, 3])): CoverResult => ({
  status: "ok",
  bytes,
  contentType: "image/jpeg",
  checksum
});

describe("runImages", () => {
  it("processes pending and failed events, updates statuses, and returns summary counts", async () => {
    const events: ImagesEvent[] = [
      { webflow_item_id: "upload-event", external_link: "https://instagram.com/p/1", image_checksum: null, image_status: "pending" },
      { webflow_item_id: "skip-event", external_link: "https://instagram.com/p/2", image_checksum: "samechecksum", image_status: "ok" },
      { webflow_item_id: "unavailable-event", external_link: "https://example.com", image_checksum: null, image_status: "pending" },
      { webflow_item_id: "failed-event", external_link: "https://instagram.com/p/3", image_checksum: null, image_status: "failed" }
    ];
    const updates: { readonly id: string; readonly fields: unknown }[] = [];
    const uploaded: { readonly id: string; readonly bytes: Uint8Array; readonly contentType: string }[] = [];
    const logs: string[] = [];
    const db: ImagesDbClient = {
      selectPendingEvents: async (refresh) => {
        expect(refresh).toBe(true);
        return events;
      },
      updateEventImage: async (id, fields) => {
        updates.push({ id, fields });
      }
    };
    const storage: StorageClient = {
      uploadEventImage: async (eventId, bytes, contentType) => {
        uploaded.push({ id: eventId, bytes, contentType });
        return `https://supabase.test/storage/v1/object/public/event-images/events/${eventId}.jpg`;
      }
    };

    const summary = await runImages({
      db,
      storage,
      refresh: true,
      now: () => new Date("2026-06-30T12:00:00.000Z"),
      fetcher: async (url) => {
        if (url?.endsWith("/1")) return okResult("abcdef1234567890");
        if (url?.endsWith("/2")) return okResult("samechecksum");
        if (url?.endsWith("/3")) return { status: "failed", reason: "rate limited" };
        return { status: "unavailable" };
      },
      logger: {
        error: (message) => logs.push(message),
        info: () => undefined
      }
    });

    expect(uploaded).toEqual([
      { id: "upload-event", bytes: new Uint8Array([1, 2, 3]), contentType: "image/jpeg" }
    ]);
    expect(updates).toHaveLength(3);
    expect(updates).toEqual(
      expect.arrayContaining([
        {
        id: "upload-event",
        fields: {
          image_url: "https://supabase.test/storage/v1/object/public/event-images/events/upload-event.jpg?v=abcdef12",
          image_status: "ok",
          image_checksum: "abcdef1234567890",
          image_fetched_at: "2026-06-30T12:00:00.000Z"
        }
        },
        {
        id: "unavailable-event",
        fields: {
          image_url: null,
          image_status: "unavailable",
          image_fetched_at: "2026-06-30T12:00:00.000Z"
        }
        },
        {
        id: "failed-event",
        fields: {
          image_status: "failed",
          image_fetched_at: "2026-06-30T12:00:00.000Z"
        }
        }
      ])
    );
    expect(logs).toEqual(["Image fetch failed for failed-event: rate limited"]);
    expect(summary).toEqual({ scanned: 4, fetched: 1, unavailable: 1, failed: 1, skipped: 1 });
  });

  it("honors concurrency and sleeps between worker requests", async () => {
    const events = Array.from({ length: 5 }, (_, index) => ({
      webflow_item_id: `event-${index}`,
      external_link: `https://instagram.com/p/${index}`,
      image_checksum: null,
      image_status: "pending"
    }));
    let active = 0;
    let maxActive = 0;
    const sleeps: number[] = [];

    const summary = await runImages({
      db: {
        selectPendingEvents: async () => events,
        updateEventImage: async () => undefined
      },
      storage: {
        uploadEventImage: async (eventId) => `https://cdn.test/${eventId}.jpg`
      },
      concurrency: 2,
      minDelayMs: 25,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      fetcher: async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await Promise.resolve();
        active -= 1;
        return okResult("checksum");
      }
    });

    expect(maxActive).toBeLessThanOrEqual(2);
    expect(sleeps).toEqual([25, 25, 25, 25]);
    expect(summary).toEqual({ scanned: 5, fetched: 5, unavailable: 0, failed: 0, skipped: 0 });
  });

  it("retries once after a delay on transient 429/5xx failures, then succeeds", async () => {
    const sleeps: number[] = [];
    const attempts: number[] = [];
    let calls = 0;

    const summary = await runImages({
      db: {
        selectPendingEvents: async () => [
          {
            webflow_item_id: "event-429",
            external_link: "https://instagram.com/p/retry",
            image_checksum: null,
            image_status: "pending"
          }
        ],
        updateEventImage: async () => undefined
      },
      storage: {
        uploadEventImage: async (eventId) => `https://cdn.test/${eventId}.jpg`
      },
      minDelayMs: 0,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      fetcher: async () => {
        calls += 1;
        attempts.push(calls);
        if (calls === 1) {
          return { status: "failed", reason: "Instagram post request failed with status 429" };
        }
        return okResult("checksum-retry");
      }
    });

    expect(attempts).toEqual([1, 2]);
    expect(sleeps).toEqual([2000]);
    expect(summary).toEqual({ scanned: 1, fetched: 1, unavailable: 0, failed: 0, skipped: 0 });
  });

  it("does not retry non-transient failures", async () => {
    let calls = 0;

    const summary = await runImages({
      db: {
        selectPendingEvents: async () => [
          {
            webflow_item_id: "event-403",
            external_link: "https://instagram.com/p/hard-fail",
            image_checksum: null,
            image_status: "pending"
          }
        ],
        updateEventImage: async () => undefined
      },
      storage: {
        uploadEventImage: async (eventId) => `https://cdn.test/${eventId}.jpg`
      },
      minDelayMs: 0,
      logger: { info: () => undefined, error: () => undefined },
      fetcher: async () => {
        calls += 1;
        return { status: "failed", reason: "Instagram post request failed with status 403" };
      }
    });

    expect(calls).toBe(1);
    expect(summary).toEqual({ scanned: 1, fetched: 0, unavailable: 0, failed: 1, skipped: 0 });
  });

  it("does not let one event exception abort the run", async () => {
    const updates: string[] = [];
    const summary = await runImages({
      db: {
        selectPendingEvents: async () => [
          { webflow_item_id: "throws", external_link: "https://instagram.com/p/1", image_checksum: null, image_status: "pending" },
          { webflow_item_id: "continues", external_link: "https://instagram.com/p/2", image_checksum: null, image_status: "pending" }
        ],
        updateEventImage: async (id) => {
          updates.push(id);
        }
      },
      storage: {
        uploadEventImage: async (eventId) => `https://cdn.test/${eventId}.jpg`
      },
      fetcher: async (url) => {
        if (url?.endsWith("/1")) {
          throw new Error("unexpected fetcher throw");
        }
        return { status: "unavailable" };
      }
    });

    expect(updates).toEqual(["throws", "continues"]);
    expect(summary).toEqual({ scanned: 2, fetched: 0, unavailable: 1, failed: 1, skipped: 0 });
  });

  it("keeps running when marking a thrown event as failed also fails", async () => {
    const logs: string[] = [];
    const summary = await runImages({
      db: {
        selectPendingEvents: async () => [
          { webflow_item_id: "throws", external_link: "https://instagram.com/p/1", image_checksum: null, image_status: "pending" }
        ],
        updateEventImage: async () => {
          throw new Error("write denied");
        }
      },
      storage: {
        uploadEventImage: async (eventId) => `https://cdn.test/${eventId}.jpg`
      },
      fetcher: async () => {
        throw new Error("unexpected fetcher throw");
      },
      logger: {
        info: () => undefined,
        error: (message) => logs.push(message)
      }
    });

    expect(logs).toEqual([
      "Image processing failed for throws: unexpected fetcher throw",
      "Failed to mark image failed for throws: write denied"
    ]);
    expect(summary).toEqual({ scanned: 1, fetched: 0, unavailable: 0, failed: 1, skipped: 0 });
  });
});
