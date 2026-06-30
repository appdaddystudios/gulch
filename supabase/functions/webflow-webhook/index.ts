import { z } from "npm:zod";
import { constantTimeEqual, jsonResponse, verifyHmacSha256 } from "../_shared/auth.ts";
import {
  createServiceClient,
  loadKnownOrganizerIds,
  replaceEventOrganizers,
  upsertRows,
  type TableName
} from "../_shared/db.ts";
import { geocode, type GeocodeResult } from "../_shared/geocode.ts";
import {
  deriveEventOrganizers,
  mapEvent,
  mapLocation,
  mapOrganizer,
  mapShow,
  type EventOrganizerRow,
  type UpsertRow
} from "../_shared/mappers.ts";
import { COLLECTIONS, TABLE_BY_COLLECTION_ID, type CollectionName, type WebflowItem } from "../_shared/schemas.ts";
import { fetchLiveItem, type FetchLike } from "../_shared/webflow.ts";

type UpsertFn = (table: TableName, rows: readonly UpsertRow[]) => Promise<void>;
type ReplaceEventOrganizersFn = (
  eventId: string,
  rows: readonly EventOrganizerRow[],
  knownOrganizerIds: ReadonlySet<string>
) => Promise<{ inserted: number; skipped: number }>;

export type WebhookDeps = {
  env?: (key: string) => string | undefined;
  fetcher?: FetchLike;
  fetchLiveItemFn?: (token: string, collectionId: string, itemId: string) => Promise<WebflowItem | null>;
  geocoder?: (address: string | null) => Promise<GeocodeResult>;
  upsert?: UpsertFn;
  loadKnownOrganizerIds?: () => Promise<Set<string>>;
  replaceEventOrganizers?: ReplaceEventOrganizersFn;
  now?: () => string;
};

const payloadSchema = z.object({
  triggerType: z.string().optional(),
  payload: z.unknown().optional(),
  collectionId: z.string().optional(),
  itemId: z.string().optional(),
  id: z.string().optional()
}).passthrough();

const nestedPayloadSchema = z.object({
  collectionId: z.string().optional(),
  collection_id: z.string().optional(),
  itemId: z.string().optional(),
  item_id: z.string().optional(),
  id: z.string().optional()
}).passthrough();

function extractPayload(raw: unknown): { triggerType: string | undefined; collectionId: string | undefined; itemId: string | undefined } {
  const parsed = payloadSchema.parse(raw);
  const nested = parsed.payload == null ? {} : nestedPayloadSchema.parse(parsed.payload);
  return {
    triggerType: parsed.triggerType,
    collectionId: nested.collectionId ?? nested.collection_id ?? parsed.collectionId,
    itemId: nested.itemId ?? nested.item_id ?? nested.id ?? parsed.itemId ?? parsed.id
  };
}

async function defaultUpsert(table: TableName, rows: readonly UpsertRow[]): Promise<void> {
  await upsertRows(createServiceClient(), table, rows);
}

async function defaultLoadKnownOrganizerIds(): Promise<Set<string>> {
  return loadKnownOrganizerIds(createServiceClient());
}

async function defaultReplaceEventOrganizers(
  eventId: string,
  rows: readonly EventOrganizerRow[],
  knownOrganizerIds: ReadonlySet<string>
): Promise<{ inserted: number; skipped: number }> {
  return replaceEventOrganizers(createServiceClient(), eventId, rows, knownOrganizerIds);
}

async function mapWebhookItem(
  table: CollectionName,
  item: WebflowItem,
  geocoder: (address: string | null) => Promise<GeocodeResult>,
  knownOrganizerIds: ReadonlySet<string>,
  now: () => string
): Promise<UpsertRow> {
  if (table === "events") return mapEvent(item);
  if (table === "organizers") return mapOrganizer(item);
  if (table === "shows") return mapShow(item);

  const mapped = mapLocation(item);
  const row =
    mapped.managing_organizer_id && !knownOrganizerIds.has(mapped.managing_organizer_id)
      ? { ...mapped, managing_organizer_id: null }
      : mapped;
  const result = await geocoder(row.name_address);
  row.latitude = result.latitude;
  row.longitude = result.longitude;
  row.geocode_status = result.status;
  row.geocoded_at = result.status === "ok" ? now() : null;
  return row;
}

export function createWebhookHandler(deps: WebhookDeps = {}): (request: Request) => Promise<Response> {
  const env = deps.env ?? Deno.env.get;
  const fetcher = deps.fetcher ?? fetch;
  const fetchItem = deps.fetchLiveItemFn ?? ((token, collectionId, itemId) => fetchLiveItem(token, collectionId, itemId, fetcher));
  const geocoder = deps.geocoder ?? ((address) => geocode(env("MAPBOX_TOKEN") ?? "", address, fetcher));
  const upsert = deps.upsert ?? defaultUpsert;
  const loadOrganizerIds = deps.loadKnownOrganizerIds ?? defaultLoadKnownOrganizerIds;
  const replaceEventOrgs = deps.replaceEventOrganizers ?? defaultReplaceEventOrganizers;
  const now = deps.now ?? (() => new Date().toISOString());

  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return jsonResponse({ ok: false }, 405);

    const webhookSecret = env("GULCH_WEBHOOK_SECRET");
    const requestSecret = new URL(request.url).searchParams.get("secret") ?? "";
    if (!webhookSecret || !constantTimeEqual(webhookSecret, requestSecret)) {
      return jsonResponse({ ok: false }, 401);
    }

    const rawBody = await request.text();
    const signature = request.headers.get("x-webflow-signature");
    const timestamp = request.headers.get("x-webflow-timestamp");
    const signingSecret = env("GULCH_WEBFLOW_SIGNING_SECRET");
    if (signingSecret) {
      if (!signature || !timestamp) return jsonResponse({ ok: false }, 401);
      if (!(await verifyHmacSha256(signingSecret, timestamp, rawBody, signature))) {
        return jsonResponse({ ok: false }, 401);
      }
    }

    const { triggerType, collectionId, itemId } = extractPayload(JSON.parse(rawBody));
    if (triggerType !== "collection_item_created") return jsonResponse({ ok: true });
    if (!collectionId || !itemId) return jsonResponse({ ok: false, error: "missing item identifiers" }, 400);

    const table = TABLE_BY_COLLECTION_ID[collectionId];
    if (!table) return jsonResponse({ ok: true });

    const webflowToken = env("GULCH_WEBFLOW_API_KEY");
    if (!webflowToken) throw new Error("Missing GULCH_WEBFLOW_API_KEY");
    if (table === "locations" && !env("MAPBOX_TOKEN")) throw new Error("Missing MAPBOX_TOKEN");

    const item = await fetchItem(webflowToken, collectionId, itemId);
    if (!item) return jsonResponse({ ok: true });

    const knownOrganizerIds = table === "shows" ? new Set<string>() : await loadOrganizerIds();
    const row = await mapWebhookItem(table, item, geocoder, knownOrganizerIds, now);
    await upsert(table, [row]);
    if (table === "events") {
      await replaceEventOrgs(item.id, deriveEventOrganizers(item), knownOrganizerIds);
    }
    return jsonResponse({ ok: true });
  };
}

if (import.meta.main) {
  Deno.serve(createWebhookHandler());
}

export { COLLECTIONS };
