import { createDbClient } from "@gulch/db";
import { z } from "zod";

import { fetchInstagramCover } from "./image-fetcher";
import { runImages, type EventImageUpdate, type ImagesDbClient, type ImagesEvent, type StorageClient } from "./images";

type ProcessEnv = Record<string, string | undefined>;
type ServiceRoleDbEnv = {
  readonly SUPABASE_URL: string;
  readonly SUPABASE_KEY: string;
};

type SupabaseImagesClient = {
  readonly from: (table: "events") => {
    readonly select: (columns: "webflow_item_id,external_link,image_checksum,image_status") => {
      readonly in: (
        column: "image_status",
        values: readonly ["pending", "failed"]
      ) => PromiseLike<{ readonly data: readonly ImagesEvent[] | null; readonly error: null | { readonly message: string } }>;
      readonly not: (
        column: "webflow_item_id",
        operator: "is",
        value: null
      ) => PromiseLike<{ readonly data: readonly ImagesEvent[] | null; readonly error: null | { readonly message: string } }>;
    };
    readonly update: (values: EventImageUpdate) => {
      readonly eq: (
        column: "webflow_item_id",
        value: string
      ) => PromiseLike<{ readonly error: null | { readonly message: string } }>;
    };
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

export function createImagesDbClient(supabase: SupabaseImagesClient): ImagesDbClient {
  return {
    async selectPendingEvents(refresh = false) {
      const query = supabase.from("events").select("webflow_item_id,external_link,image_checksum,image_status");
      const result = refresh
        ? await query.not("webflow_item_id", "is", null)
        : await query.in("image_status", ["pending", "failed"]);

      if (result.error) {
        throw new Error(`Failed to load image events: ${result.error.message}`);
      }

      return result.data ?? [];
    },
    async updateEventImage(id, fields) {
      const result = await supabase.from("events").update(fields).eq("webflow_item_id", id);

      if (result.error) {
        throw new Error(`Failed to update event image ${id}: ${result.error.message}`);
      }
    }
  };
}

export function createStorageClient(supabase: SupabaseImagesClient): StorageClient {
  return {
    async uploadEventImage(eventId, bytes, contentType) {
      const path = `events/${eventId}.jpg`;
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
