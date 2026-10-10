import { z } from "npm:zod";
import { constantTimeEqual, jsonResponse, verifyHmacSha256 } from "../_shared/auth.ts";
import {
  applyEventRows,
  createServiceClient,
  lastSyncRunStartedAt,
  loadEventImageState,
  loadKnownOrganizerIds,
  replaceEventOrganizers,
  setEventsLive,
  upsertRows,
  type EventImageState,
  type EventWriteResult,
  type TableName
} from "../_shared/db.ts";
import { geocode, type GeocodeResult } from "../_shared/geocode.ts";
import { fetchHeroImage, type HeroImageOutcome } from "../_shared/images.ts";
import {
  deriveEventOrganizers,
  mapEvent,
  mapLocation,
  mapOrganizer,
  mapShow,
  type EventOrganizerRow,
  type EventRow,
  type UpsertRow
} from "../_shared/mappers.ts";
import { runRefresh, type RefreshDeps, type RefreshSummary } from "../_shared/refresh.ts";
import { COLLECTIONS, TABLE_BY_COLLECTION_ID, type CollectionName, type WebflowItem } from "../_shared/schemas.ts";
import { fetchLiveItem, type FetchLike } from "../_shared/webflow.ts";

type UpsertFn = (table: TableName, rows: readonly UpsertRow[]) => Promise<void>;
type ReplaceEventOrganizersFn = (
  eventId: string,
  rows: readonly EventOrganizerRow[],
  knownOrganizerIds: ReadonlySet<string>,
  observedAt: string
) => Promise<{ inserted: number; skipped: number; applied: boolean }>;
type SetEventsLiveFn = (ids: readonly string[], isLive: boolean, observedAt: string) => Promise<{ updated: number }>;
type ApplyEventRowsFn = (
  rows: readonly EventRow[],
  observedAt: string,
  pendingIds: ReadonlySet<string>
) => Promise<EventWriteResult>;

export type WebhookDeps = {
  env?: (key: string) => string | undefined;
  fetcher?: FetchLike;
  fetchLiveItemFn?: (token: string, collectionId: string, itemId: string) => Promise<WebflowItem | null>;
  geocoder?: (address: string | null) => Promise<GeocodeResult>;
  upsert?: UpsertFn;
  loadKnownOrganizerIds?: () => Promise<Set<string>>;
  replaceEventOrganizers?: ReplaceEventOrganizersFn;
  setEventsLive?: SetEventsLiveFn;
  // Background work (full reconcile, hero image) runs after the response.
  waitUntil?: (promise: Promise<unknown>) => void;
  runRefresh?: (source: "site_publish") => Promise<RefreshSummary>;
  refreshDeps?: RefreshDeps;
  lastSiteRefreshStartedAt?: () => Promise<string | null>;
  loadEventImageState?: (eventId: string) => Promise<EventImageState | null>;
  applyEventRows?: ApplyEventRowsFn;
  fetchHeroImage?: (eventId: string, externalLink: string | null) => Promise<HeroImageOutcome>;
  now?: () => string;
};

// Webflow may fire site_publish alongside every item publish; one reconcile
// per window is plenty since each item publish is already handled directly.
export const SITE_PUBLISH_DEBOUNCE_MS = 120_000;

const UPSERT_TRIGGERS = new Set(["collection_item_created", "collection_item_published"]);
const HIDE_TRIGGERS = new Set(["collection_item_unpublished", "collection_item_deleted"]);
const SITE_PUBLISH_TRIGGER = "site_publish";

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

type ExtractedPayload = { triggerType: string | undefined; collectionId: string | undefined; itemId: string | undefined };

function extractPayload(raw: unknown): ExtractedPayload {
  const parsed = payloadSchema.parse(raw);
  const nested = parsed.payload == null ? {} : nestedPayloadSchema.parse(parsed.payload);
  return {
    triggerType: parsed.triggerType,
    collectionId: nested.collectionId ?? nested.collection_id ?? parsed.collectionId,
    itemId: nested.itemId ?? nested.item_id ?? nested.id ?? parsed.itemId ?? parsed.id
  };
}

function defaultWaitUntil(promise: Promise<unknown>): void {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime;
  const tracked = promise.catch((error: unknown) => {
    console.error(`background task failed: ${error instanceof Error ? error.message : String(error)}`);
  });
  if (runtime) runtime.waitUntil(tracked);
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

function resolveDeps(deps: WebhookDeps) {
  const env = deps.env ?? Deno.env.get;
  const fetcher = deps.fetcher ?? fetch;
  return {
    env,
    fetchItem: deps.fetchLiveItemFn ??
      ((token: string, collectionId: string, itemId: string) => fetchLiveItem(token, collectionId, itemId, fetcher)),
    geocoder: deps.geocoder ?? ((address: string | null) => geocode(env("MAPBOX_TOKEN") ?? "", address, fetcher)),
    upsert: deps.upsert ?? ((table: TableName, rows: readonly UpsertRow[]) => upsertRows(createServiceClient(), table, rows)),
    loadOrganizerIds: deps.loadKnownOrganizerIds ?? (() => loadKnownOrganizerIds(createServiceClient())),
    replaceEventOrgs: deps.replaceEventOrganizers ??
      ((eventId: string, rows: readonly EventOrganizerRow[], known: ReadonlySet<string>, observedAt: string) =>
        replaceEventOrganizers(createServiceClient(), eventId, rows, known, observedAt)),
    setEventsLive: deps.setEventsLive ??
      ((ids: readonly string[], isLive: boolean, observedAt: string) =>
        setEventsLive(createServiceClient(), ids, isLive, observedAt)),
    waitUntil: deps.waitUntil ?? defaultWaitUntil,
    runRefresh: deps.runRefresh ?? ((source: "site_publish") => runRefresh(deps.refreshDeps ?? { env, fetcher }, source)),
    lastSiteRefreshStartedAt: deps.lastSiteRefreshStartedAt ??
      (() => lastSyncRunStartedAt(createServiceClient(), "site_publish")),
    loadEventImageState: deps.loadEventImageState ??
      ((eventId: string) => loadEventImageState(createServiceClient(), eventId)),
    applyEventRows: deps.applyEventRows ??
      ((rows: readonly EventRow[], observedAt: string, pendingIds: ReadonlySet<string>) =>
        applyEventRows(createServiceClient(), rows, observedAt, pendingIds)),
    fetchHeroImage: deps.fetchHeroImage ??
      ((eventId: string, externalLink: string | null) => fetchHeroImage(eventId, externalLink, { fetcher })),
    now: deps.now ?? (() => new Date().toISOString())
  };
}

type Resolved = ReturnType<typeof resolveDeps>;

async function upsertLiveItem(d: Resolved, table: CollectionName, collectionId: string, itemId: string): Promise<Response> {
  const webflowToken = d.env("GULCH_WEBFLOW_API_KEY");
  if (!webflowToken) throw new Error("Missing GULCH_WEBFLOW_API_KEY");
  if (table === "locations" && !d.env("MAPBOX_TOKEN")) throw new Error("Missing MAPBOX_TOKEN");

  // Observation time is taken before the fetch: the state we are about to
  // apply is at least this new (see applyEventRows in _shared/db.ts).
  const observedAt = d.now();
  const item = await d.fetchItem(webflowToken, collectionId, itemId);
  if (!item) return jsonResponse({ ok: true, skipped: "not live" });

  const knownOrganizerIds = table === "shows" ? new Set<string>() : await d.loadOrganizerIds();
  if (table === "events") {
    return applyEventItem(d, { token: webflowToken, collectionId }, item, mapEvent(item), knownOrganizerIds, observedAt);
  }

  // Other tables carry no liveness or image state; a stale overlap here is
  // repaired by the next reconcile, which compares webflow_last_updated.
  const row = await mapWebhookItem(table, item, d.geocoder, knownOrganizerIds, d.now);
  await d.upsert(table, [row]);
  return jsonResponse({ ok: true });
}

// The event write is ordered by observation time. A handler whose snapshot
// lost to a newer one (a later publish, or an unpublish received after this
// fetch began) stops here: no organizers, no image reset, no hero fetch.
async function applyEventItem(
  d: Resolved,
  source: { token: string; collectionId: string },
  item: WebflowItem,
  row: EventRow,
  knownOrganizerIds: ReadonlySet<string>,
  observedAt: string
): Promise<Response> {
  // Read before the write so a changed link is seen; it then rides inside
  // the same ordered write as image_status = pending.
  const before = await d.loadEventImageState(row.webflow_item_id);
  const linkChanged = before !== null && (before.external_link ?? null) !== row.external_link;
  const pendingIds = new Set(linkChanged ? [row.webflow_item_id] : []);

  const write = await d.applyEventRows([row], observedAt, pendingIds);
  if (write.stale > 0) return jsonResponse({ ok: true, stale: true });
  if (write.insertedIds.length > 0 && await goneSinceInsert(d, source, row.webflow_item_id)) {
    return jsonResponse({ ok: true, hidden: 1 });
  }

  // Replaced inside the database against the row's current observation; a
  // refusal means a newer write landed since ours, so we are stale after all.
  const organizers = await d.replaceEventOrgs(item.id, deriveEventOrganizers(item), knownOrganizerIds, observedAt);
  if (!organizers.applied) return jsonResponse({ ok: true, stale: true });
  // Home hides events without an image and the images job runs only every
  // 6 h: fetch now when the row is new, still pending, or its link changed.
  const needsFetch = before === null || before.image_status === "pending" || linkChanged;
  if (needsFetch) d.waitUntil(d.fetchHeroImage(row.webflow_item_id, row.external_link));
  return jsonResponse({ ok: true });
}

// A brand-new row carries no observation an earlier unpublish could have
// beaten: a hide that found no row left nothing behind. Re-read once after
// inserting, with a fresh observation, and hide if the item is already gone.
async function goneSinceInsert(d: Resolved, source: { token: string; collectionId: string }, eventId: string): Promise<boolean> {
  const observedAt = d.now();
  if (await d.fetchItem(source.token, source.collectionId, eventId)) return false;
  await d.setEventsLive([eventId], false, observedAt);
  return true;
}

async function hideItem(d: Resolved, table: CollectionName, itemId: string): Promise<Response> {
  if (table !== "events") return jsonResponse({ ok: true, ignored: table });
  // Receipt time is the observation: the unpublish happened no later than now.
  const { updated } = await d.setEventsLive([itemId], false, d.now());
  return jsonResponse({ ok: true, hidden: updated });
}

async function scheduleReconcile(d: Resolved): Promise<Response> {
  const last = await d.lastSiteRefreshStartedAt();
  if (last !== null && Date.parse(d.now()) - Date.parse(last) < SITE_PUBLISH_DEBOUNCE_MS) {
    return jsonResponse({ ok: true, debounced: true });
  }
  d.waitUntil(d.runRefresh("site_publish"));
  return jsonResponse({ ok: true, scheduled: "reconcile" });
}

export function createWebhookHandler(deps: WebhookDeps = {}): (request: Request) => Promise<Response> {
  const d = resolveDeps(deps);

  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return jsonResponse({ ok: false }, 405);

    const webhookSecret = d.env("GULCH_WEBHOOK_SECRET");
    const requestSecret = new URL(request.url).searchParams.get("secret") ?? "";
    if (!webhookSecret || !constantTimeEqual(webhookSecret, requestSecret)) {
      return jsonResponse({ ok: false }, 401);
    }

    const rawBody = await request.text();
    const signature = request.headers.get("x-webflow-signature");
    const timestamp = request.headers.get("x-webflow-timestamp");
    const signingSecret = d.env("GULCH_WEBFLOW_SIGNING_SECRET");
    if (signingSecret) {
      if (!signature || !timestamp) return jsonResponse({ ok: false }, 401);
      if (!(await verifyHmacSha256(signingSecret, timestamp, rawBody, signature))) {
        return jsonResponse({ ok: false }, 401);
      }
    }

    const { triggerType, collectionId, itemId } = extractPayload(JSON.parse(rawBody));
    if (triggerType === SITE_PUBLISH_TRIGGER) return scheduleReconcile(d);

    const isUpsert = triggerType !== undefined && UPSERT_TRIGGERS.has(triggerType);
    const isHide = triggerType !== undefined && HIDE_TRIGGERS.has(triggerType);
    // collection_item_changed (a staged, unpublished edit) and anything else:
    // the site did not change, so the app must not.
    if (!isUpsert && !isHide) return jsonResponse({ ok: true });
    if (!collectionId || !itemId) return jsonResponse({ ok: false, error: "missing item identifiers" }, 400);

    const table = TABLE_BY_COLLECTION_ID[collectionId];
    if (!table) return jsonResponse({ ok: true });

    return isHide ? hideItem(d, table, itemId) : upsertLiveItem(d, table, collectionId, itemId);
  };
}

if (import.meta.main) {
  Deno.serve(createWebhookHandler());
}

export { COLLECTIONS };
