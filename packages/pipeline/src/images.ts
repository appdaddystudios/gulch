import { fetchInstagramCover, type CoverResult } from "./image-fetcher";
import type { Sleep } from "./webflow-client";

export type ImagesEvent = {
  readonly webflow_item_id: string;
  readonly external_link: string | null;
  readonly image_checksum: string | null;
  readonly image_status: string;
};

export type EventImageUpdate = {
  readonly image_url?: string | null;
  readonly image_status: string;
  readonly image_checksum?: string | null;
  readonly image_fetched_at: string;
};

export type ImagesDbClient = {
  readonly selectPendingEvents: (refresh?: boolean) => Promise<readonly ImagesEvent[]>;
  readonly updateEventImage: (id: string, fields: EventImageUpdate) => Promise<void>;
};

export type StorageClient = {
  readonly uploadEventImage: (eventId: string, bytes: Uint8Array, contentType: string) => Promise<string>;
};

export type ImagesSummary = {
  readonly scanned: number;
  readonly fetched: number;
  readonly unavailable: number;
  readonly failed: number;
  readonly skipped: number;
};

export type ImagesLogger = Pick<Console, "info" | "error">;

export type RunImagesOptions = {
  readonly db: ImagesDbClient;
  readonly fetcher?: (postUrl: string | null) => Promise<CoverResult>;
  readonly storage: StorageClient;
  readonly logger?: ImagesLogger;
  readonly concurrency?: number;
  readonly minDelayMs?: number;
  readonly sleep?: Sleep;
  readonly now?: () => Date;
  readonly refresh?: boolean;
};

const defaultConcurrency = 3;
const defaultMinDelayMs = 600;
const defaultSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runImages(options: RunImagesOptions): Promise<ImagesSummary> {
  const events = await options.db.selectPendingEvents(options.refresh ?? false);
  const summary = mutableSummary(events.length);
  const concurrency = Math.max(1, Math.floor(options.concurrency ?? defaultConcurrency));
  const sleep = options.sleep ?? defaultSleep;
  const minDelayMs = options.minDelayMs ?? defaultMinDelayMs;
  const fetcher = options.fetcher ?? ((postUrl) => fetchInstagramCover(postUrl, { fetch: globalThis.fetch.bind(globalThis) }));
  const now = options.now ?? (() => new Date());
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    while (nextIndex < events.length) {
      const index = nextIndex;
      nextIndex += 1;

      const event = events[index];
      if (event) {
        await processEvent(event, { ...options, fetcher, now }, summary);
      }

      if (nextIndex < events.length && minDelayMs > 0) {
        await sleep(minDelayMs);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, events.length) }, () => worker()));

  return summary;
}

async function processEvent(
  event: ImagesEvent,
  options: Required<Pick<RunImagesOptions, "db" | "fetcher" | "storage" | "now">> & Pick<RunImagesOptions, "logger">,
  summary: MutableImagesSummary
): Promise<void> {
  const fetchedAt = options.now().toISOString();

  try {
    const result = await options.fetcher(event.external_link);

    if (result.status === "ok") {
      if (result.checksum === event.image_checksum && event.image_status === "ok") {
        summary.skipped += 1;
        return;
      }

      const publicUrl = await options.storage.uploadEventImage(event.webflow_item_id, result.bytes, result.contentType);
      await options.db.updateEventImage(event.webflow_item_id, {
        image_url: `${publicUrl}?v=${result.checksum.slice(0, 8)}`,
        image_status: "ok",
        image_checksum: result.checksum,
        image_fetched_at: fetchedAt
      });
      summary.fetched += 1;
      return;
    }

    if (result.status === "unavailable") {
      await options.db.updateEventImage(event.webflow_item_id, {
        image_url: null,
        image_status: "unavailable",
        image_fetched_at: fetchedAt
      });
      summary.unavailable += 1;
      return;
    }

    options.logger?.error(`Image fetch failed for ${event.webflow_item_id}: ${result.reason}`);
    await options.db.updateEventImage(event.webflow_item_id, {
      image_status: "failed",
      image_fetched_at: fetchedAt
    });
    summary.failed += 1;
  } catch (error) {
    options.logger?.error(
      `Image processing failed for ${event.webflow_item_id}: ${error instanceof Error ? error.message : String(error)}`
    );

    try {
      await options.db.updateEventImage(event.webflow_item_id, {
        image_status: "failed",
        image_fetched_at: fetchedAt
      });
    } catch (updateError) {
      options.logger?.error(
        `Failed to mark image failed for ${event.webflow_item_id}: ${
          updateError instanceof Error ? updateError.message : String(updateError)
        }`
      );
    }

    summary.failed += 1;
  }
}

type MutableImagesSummary = {
  scanned: number;
  fetched: number;
  unavailable: number;
  failed: number;
  skipped: number;
};

function mutableSummary(scanned: number): MutableImagesSummary {
  return { scanned, fetched: 0, unavailable: 0, failed: 0, skipped: 0 };
}
