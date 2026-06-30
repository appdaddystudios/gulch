import { constantTimeEqual, jsonResponse } from "../_shared/auth.ts";
import {
  createServiceClient,
  existingByIdLastUpdated,
  existingEventById,
  existingLocationById,
  loadExistingRows,
  markEventsImagePending,
  replaceAllEventOrganizers,
  updateLocationManagingOrganizerRefs,
  type TableName,
  type ExistingRow,
  type ManagingOrganizerRefUpdate
} from "../_shared/db.ts";
import { geocode, type GeocodeResult } from "../_shared/geocode.ts";
import { type EventOrganizerRow, type UpsertRow } from "../_shared/mappers.ts";
import {
  deriveGuardedEventOrganizers,
  reconcile,
  reconcileManagingOrganizerRefs,
  type ReconcileSummary
} from "../_shared/reconcile.ts";
import { COLLECTIONS, type CollectionName, type WebflowItem } from "../_shared/schemas.ts";
import { fetchLiveItems, type FetchLike } from "../_shared/webflow.ts";

type ExistingLoader = (table: CollectionName) => Promise<ExistingRow[]>;
type FetchItems = (token: string, collectionId: string) => Promise<WebflowItem[]>;
type UpsertFn = (table: TableName, rows: readonly UpsertRow[]) => Promise<void>;
type ReplaceAllEventOrganizersFn = (rows: readonly EventOrganizerRow[]) => Promise<{ inserted: number }>;
type UpdateManagingOrganizerRefsFn = (
  updates: readonly ManagingOrganizerRefUpdate[]
) => Promise<{ updated: number }>;
type MarkEventsImagePendingFn = (ids: readonly string[]) => Promise<{ updated: number }>;

export type RefreshDeps = {
  env?: (key: string) => string | undefined;
  fetcher?: FetchLike;
  fetchItems?: FetchItems;
  loadExisting?: ExistingLoader;
  upsert?: UpsertFn;
  replaceAllEventOrganizers?: ReplaceAllEventOrganizersFn;
  updateManagingOrganizerRefs?: UpdateManagingOrganizerRefsFn;
  markEventsImagePending?: MarkEventsImagePendingFn;
  geocoder?: (address: string | null) => Promise<GeocodeResult>;
  now?: () => string;
};

type Summary = Record<CollectionName, ReconcileSummary> & {
  eventOrganizers: { derived: number; replaced: number; skipped: number };
  managingRefs: { updated: number };
  imagePending: { marked: number };
};

const ORDER: CollectionName[] = ["organizers", "locations", "events", "shows"];
const BATCH_SIZE = 500;

async function defaultLoadExisting(table: CollectionName): Promise<ExistingRow[]> {
  return loadExistingRows(createServiceClient(), table);
}

async function defaultUpsert(table: TableName, rows: readonly UpsertRow[]): Promise<void> {
  const { upsertRows } = await import("../_shared/db.ts");
  await upsertRows(createServiceClient(), table, rows);
}

async function defaultReplaceAllEventOrganizers(rows: readonly EventOrganizerRow[]): Promise<{ inserted: number }> {
  return replaceAllEventOrganizers(createServiceClient(), rows);
}

async function defaultUpdateManagingOrganizerRefs(
  updates: readonly ManagingOrganizerRefUpdate[]
): Promise<{ updated: number }> {
  return updateLocationManagingOrganizerRefs(createServiceClient(), updates);
}

async function defaultMarkEventsImagePending(ids: readonly string[]): Promise<{ updated: number }> {
  return markEventsImagePending(createServiceClient(), ids);
}

async function upsertBatches(table: TableName, rows: readonly UpsertRow[], upsert: UpsertFn): Promise<void> {
  for (let index = 0; index < rows.length; index += BATCH_SIZE) {
    await upsert(table, rows.slice(index, index + BATCH_SIZE));
  }
}

export function createRefreshHandler(deps: RefreshDeps = {}): (request: Request) => Promise<Response> {
  const env = deps.env ?? Deno.env.get;
  const fetcher = deps.fetcher ?? fetch;
  const fetchItems = deps.fetchItems ?? ((token, collectionId) => fetchLiveItems(token, collectionId, fetcher));
  const loadExisting = deps.loadExisting ?? defaultLoadExisting;
  const upsert = deps.upsert ?? defaultUpsert;
  const replaceAllEventOrgs = deps.replaceAllEventOrganizers ?? defaultReplaceAllEventOrganizers;
  const updateManagingRefs = deps.updateManagingOrganizerRefs ?? defaultUpdateManagingOrganizerRefs;
  const markImagePending = deps.markEventsImagePending ?? defaultMarkEventsImagePending;
  const geocoder = deps.geocoder ?? ((address) => geocode(env("MAPBOX_TOKEN") ?? "", address, fetcher));
  const now = deps.now ?? (() => new Date().toISOString());

  return async (request: Request): Promise<Response> => {
    const refreshSecret = env("GULCH_REFRESH_SECRET");
    const authorization = request.headers.get("authorization") ?? "";
    if (!refreshSecret || !constantTimeEqual(`Bearer ${refreshSecret}`, authorization)) {
      return jsonResponse({ ok: false }, 401);
    }

    const webflowToken = env("GULCH_WEBFLOW_API_KEY");
    if (!webflowToken) throw new Error("Missing GULCH_WEBFLOW_API_KEY");
    if (!env("MAPBOX_TOKEN")) throw new Error("Missing MAPBOX_TOKEN");

    const summary = {} as Summary;
    const existing = {
      organizers: await loadExisting("organizers"),
      locations: await loadExisting("locations"),
      events: await loadExisting("events"),
      shows: await loadExisting("shows")
    };
    const fetchedItems = {} as Record<CollectionName, WebflowItem[]>;
    let knownOrganizerIds = new Set<string>();

    for (const table of ORDER) {
      const items = await fetchItems(webflowToken, COLLECTIONS[table]);
      fetchedItems[table] = items;

      if (table === "organizers") {
        knownOrganizerIds = new Set(items.map((item) => item.id));
      }

      const result = await reconcile(items, table, {
        geocoder,
        existingByIdLastUpdated: existingByIdLastUpdated(existing[table]),
        existingLocationsById: table === "locations" ? existingLocationById(existing.locations) : undefined,
        knownOrganizerIds,
        now
      });
      await upsertBatches(table, result.rows, upsert);
      if (table === "events") {
        const imagePendingIds = changedEventExternalLinkIds(result.rows, existingEventById(existing.events));
        const imagePending = imagePendingIds.length > 0
          ? await markImagePending(imagePendingIds)
          : { updated: 0 };
        summary.imagePending = { marked: imagePending.updated };
      }
      summary[table] = result.summary;
    }

    const liveEventIds = new Set((fetchedItems.events ?? []).map((item) => item.id));
    const eventOrganizers = deriveGuardedEventOrganizers(fetchedItems.events ?? [], knownOrganizerIds, liveEventIds);
    const replaced = await replaceAllEventOrgs(eventOrganizers.rows);
    const managingRefUpdates = reconcileManagingOrganizerRefs(
      fetchedItems.locations ?? [],
      existingLocationById(existing.locations),
      knownOrganizerIds
    );
    const managingRefs = await updateManagingRefs(managingRefUpdates);

    summary.eventOrganizers = {
      derived: eventOrganizers.derived,
      replaced: replaced.inserted,
      skipped: eventOrganizers.skipped
    };
    summary.managingRefs = { updated: managingRefs.updated };
    summary.imagePending ??= { marked: 0 };
    return jsonResponse(summary);
  };
}

function changedEventExternalLinkIds(
  rows: readonly UpsertRow[],
  existingEventsById: ReadonlyMap<string, ExistingRow>
): string[] {
  return rows.flatMap((row) => {
    if (!("external_link" in row) || !("webflow_item_id" in row)) {
      return [];
    }

    const existing = existingEventsById.get(row.webflow_item_id);
    if (!existing || (existing.external_link ?? null) === row.external_link) {
      return [];
    }

    return [row.webflow_item_id];
  });
}

if (import.meta.main) {
  Deno.serve(createRefreshHandler());
}
