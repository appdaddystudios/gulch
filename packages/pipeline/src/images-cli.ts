import { createDbClient } from "@gulch/db";
import { z } from "zod";

import { fetchInstagramCover } from "./image-fetcher";
import { runImages, type EventImageUpdate, type ImagesDbClient, type ImagesEvent, type StorageClient } from "./images";

type ProcessEnv = Record<string, string | undefined>;
type ServiceRoleDbEnv = {
  readonly SUPABASE_URL: string;
  readonly SUPABASE_KEY: string;
};

type ImagesSelectResult = PromiseLike<{
  readonly data: readonly ImagesEvent[] | null;
  readonly error: null | { readonly message: string };
}>;

type ImagesFilterBuilder = {
  readonly order: (
    column: "webflow_item_id",
    options: { readonly ascending: boolean }
  ) => {
    readonly range: (from: number, to: number) => ImagesSelectResult;
  };
};

type ImagesUpdateBuilder = {
  readonly eq: (column: "webflow_item_id" | "external_link", value: string) => ImagesUpdateBuilder;
  readonly neq: (column: "image_status", value: string) => ImagesUpdateBuilder;
  readonly is: (column: "external_link", value: null) => ImagesUpdateBuilder;
  readonly select: (columns: "webflow_item_id") => PromiseLike<{
    readonly data: readonly { readonly webflow_item_id: string }[] | null;
    readonly error: null | { readonly message: string };
  }>;
};

type SupabaseImagesClient = {
  readonly from: (table: "events") => {
    readonly select: (columns: "webflow_item_id,external_link,image_checksum,image_status,is_video") => {
      readonly in: (column: "image_status", values: readonly ["pending", "failed"]) => ImagesFilterBuilder;
      readonly not: (column: "webflow_item_id", operator: "is", value: null) => ImagesFilterBuilder;
    };
    readonly update: (values: EventImageUpdate) => ImagesUpdateBuilder;
  };
  readonly storage: {
    readonly from: (bucket: "event-images") => {
      readonly upload: (
        path: string,
        bytes: Uint8Array,
        options: { readonly contentType: string; readonly upsert: true }
      ) => PromiseLike<{ readonly error: null | { readonly message: string } }>;
      readonly getPublicUrl: (path: string) => { readonly data: { readonly publicUrl: string } };
    };
  };
};

declare const process: {
  readonly env: ProcessEnv;
  readonly argv: readonly string[];
  exitCode?: number;
};

export const imagesCliEnvSchema = z.object({
  EXPO_PUBLIC_SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1)
});

export function parseImagesCliEnv(env: ProcessEnv): z.infer<typeof imagesCliEnvSchema> {
  const parsed = imagesCliEnvSchema.safeParse(env);

  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Missing or invalid required image environment variables: ${missing}`);
  }

  return parsed.data;
}

export async function main(): Promise<void> {
  const env = parseImagesCliEnv(process.env);
  const createServiceRoleDb = createDbClient as unknown as (dbEnv: ServiceRoleDbEnv) => SupabaseImagesClient;
  const supabase = createServiceRoleDb({
    SUPABASE_URL: env.EXPO_PUBLIC_SUPABASE_URL,
    SUPABASE_KEY: env.SUPABASE_SERVICE_ROLE_KEY
  });
  const refresh = process.argv.includes("--refresh");

  const summary = await runImages({
    db: createImagesDbClient(supabase),
    storage: createStorageClient(supabase),
    fetcher: (postUrl) => fetchInstagramCover(postUrl, { fetch: globalThis.fetch.bind(globalThis) }),
    refresh,
    logger: console
  });

  console.log(JSON.stringify(summary, null, 2));
}

// Supabase caps a single select at max_rows (1000 in config.toml) — page past it
// or events beyond the cap are silently never scanned.
const selectPageSize = 1000;

export function createImagesDbClient(supabase: SupabaseImagesClient): ImagesDbClient {
  return {
    async selectPendingEvents(refresh = false) {
      const events: ImagesEvent[] = [];

      for (let from = 0; ; from += selectPageSize) {
        const query = supabase.from("events").select("webflow_item_id,external_link,image_checksum,image_status,is_video");
        const filtered = refresh
          ? query.not("webflow_item_id", "is", null)
          : query.in("image_status", ["pending", "failed"]);
        const result = await filtered.order("webflow_item_id", { ascending: true }).range(from, from + selectPageSize - 1);

        if (result.error) {
          throw new Error(`Failed to load image events: ${result.error.message}`);
        }

        const page = result.data ?? [];
        events.push(...page);

        if (page.length < selectPageSize) {
          return events;
        }
      }
    },
    // Guarded by the link the image was fetched for, so a worker that
    // started before a publish changed the link cannot overwrite the newer
    // result. Resolves false when no row matched.
    async updateEventImage(id, fields, expectedExternalLink) {
      const base = supabase.from("events").update(fields).eq("webflow_item_id", id);
      const byLink =
        expectedExternalLink === null ? base.is("external_link", null) : base.eq("external_link", expectedExternalLink);
      // A failure says the attempt failed, not that the stored hero is wrong:
      // a slower same-link worker must never demote an ok row.
      const guarded = fields.image_status === "ok" ? byLink : byLink.neq("image_status", "ok");
      const result = await guarded.select("webflow_item_id");

      if (result.error) {
        throw new Error(`Failed to update event image ${id}: ${result.error.message}`);
      }

      return (result.data?.length ?? 0) > 0;
    }
  };
}

export function createStorageClient(supabase: SupabaseImagesClient): StorageClient {
  return {
    // Content-addressed key: overlapping workers write distinct objects.
    async uploadEventImage(eventId, bytes, contentType, checksum) {
      const path = `events/${eventId}-${checksum.slice(0, 8)}.jpg`;
      const result = await supabase.storage.from("event-images").upload(path, bytes, {
        contentType,
        upsert: true
      });

      if (result.error) {
        throw new Error(`Failed to upload event image ${eventId}: ${result.error.message}`);
      }

      return supabase.storage.from("event-images").getPublicUrl(path).data.publicUrl;
    }
  };
}

if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
