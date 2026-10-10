// One full reconcile against Webflow's live collections. Shared by the
// scheduled refresh-tick and the site_publish webhook so both run the same
// code and both leave a sync_runs row behind.
import {
  createServiceClient,
  existingByIdLastUpdated,
  existingEventById,
  existingLocationById,
  finishSyncRun,
  loadExistingRows,
  markEventsImagePending,
  replaceAllEventOrganizers,
  setEventsLive,
  startSyncRun,
  updateLocationManagingOrganizerRefs,
  upsertRows,
  type ExistingRow,
  type ManagingOrganizerRefUpdate,
  type SyncRunResult,
  type SyncRunSource,
  type TableName
} from "./db.ts";
import { geocode, type GeocodeResult } from "./geocode.ts";
import { type EventOrganizerRow, type UpsertRow } from "./mappers.ts";
import {
  deriveGuardedEventOrganizers,
  planPresence,
  reconcile,
  reconcileManagingOrganizerRefs,
  type ReconcileSummary
} from "./reconcile.ts";
import { COLLECTIONS, type CollectionName, type WebflowItem } from "./schemas.ts";
import { fetchLiveItems, type FetchLike } from "./webflow.ts";

export type RefreshSource = SyncRunSource;

type ExistingLoader = (table: CollectionName) => Promise<ExistingRow[]>;
type FetchItems = (token: string, collectionId: string) => Promise<WebflowItem[]>;
type UpsertFn = (table: TableName, rows: readonly UpsertRow[]) => Promise<void>;
type ReplaceAllEventOrganizersFn = (rows: readonly EventOrganizerRow[]) => Promise<{ inserted: number }>;
type UpdateManagingOrganizerRefsFn = (
  updates: readonly ManagingOrganizerRefUpdate[]
) => Promise<{ updated: number }>;
type MarkEventsImagePendingFn = (ids: readonly string[]) => Promise<{ updated: number }>;
type SetEventsLiveFn = (ids: readonly string[], isLive: boolean) => Promise<{ updated: number }>;

export type SyncRunsStore = {
  start: (source: SyncRunSource) => Promise<number | null>;
  finish: (id: number | null, result: SyncRunResult) => Promise<void>;
};

export type RefreshDeps = {
  env?: (key: string) => string | undefined;
  fetcher?: FetchLike;
  fetchItems?: FetchItems;
  loadExisting?: ExistingLoader;
  upsert?: UpsertFn;
  replaceAllEventOrganizers?: ReplaceAllEventOrganizersFn;
  updateManagingOrganizerRefs?: UpdateManagingOrganizerRefsFn;
  markEventsImagePending?: MarkEventsImagePendingFn;
  setEventsLive?: SetEventsLiveFn;
  syncRuns?: SyncRunsStore;
  geocoder?: (address: string | null) => Promise<GeocodeResult>;
  now?: () => string;
};

export type PresenceSummary = {
  hidden: number;
  revived: number;
  skipped: boolean;
  reason?: string;
};

export type RefreshSummary = Record<CollectionName, ReconcileSummary> & {
  eventOrganizers: { derived: number; replaced: number; skipped: number };
  managingRefs: { updated: number };
  imagePending: { marked: number };
  presence: PresenceSummary;
};

const ORDER: CollectionName[] = ["organizers", "locations", "events", "shows"];
const BATCH_SIZE = 500;

// Tests inject this; production uses the real table.
export const noopSyncRuns: SyncRunsStore = {
  start: () => Promise.resolve(null),
  finish: () => Promise.resolve()
};

const defaultSyncRuns: SyncRunsStore = {
  start: (source) => startSyncRun(createServiceClient(), source),
  finish: async (id, result) => {
    if (id === null) return;
    await finishSyncRun(createServiceClient(), id, result);
  }
};

async function defaultLoadExisting(table: CollectionName): Promise<ExistingRow[]> {
  return loadExistingRows(createServiceClient(), table);
}

async function defaultUpsert(table: TableName, rows: readonly UpsertRow[]): Promise<void> {
  await upsertRows(createServiceClient(), table, rows);
}

async function upsertBatches(table: TableName, rows: readonly UpsertRow[], upsert: UpsertFn): Promise<void> {
  for (let index = 0; index < rows.length; index += BATCH_SIZE) {
    await upsert(table, rows.slice(index, index + BATCH_SIZE));
  }
}

function changedEventExternalLinkIds(
  rows: readonly UpsertRow[],
  existingEventsById: ReadonlyMap<string, ExistingRow>
): string[] {
  return rows.flatMap((row) => {
    if (!("external_link" in row) || !("webflow_item_id" in row)) return [];
    const existing = existingEventsById.get(row.webflow_item_id);
    if (!existing || (existing.external_link ?? null) === row.external_link) return [];
    return [row.webflow_item_id];
  });
}

function resolveDeps(deps: RefreshDeps) {
  const env = deps.env ?? Deno.env.get;
  const fetcher = deps.fetcher ?? fetch;
  return {
    env,
    fetchItems: deps.fetchItems ?? ((token, collectionId) => fetchLiveItems(token, collectionId, fetcher)),
    loadExisting: deps.loadExisting ?? defaultLoadExisting,
    upsert: deps.upsert ?? defaultUpsert,
    replaceAllEventOrgs: deps.replaceAllEventOrganizers ??
      ((rows: readonly EventOrganizerRow[]) => replaceAllEventOrganizers(createServiceClient(), rows)),
    updateManagingRefs: deps.updateManagingOrganizerRefs ??
      ((updates: readonly ManagingOrganizerRefUpdate[]) =>
        updateLocationManagingOrganizerRefs(createServiceClient(), updates)),
    markImagePending: deps.markEventsImagePending ??
      ((ids: readonly string[]) => markEventsImagePending(createServiceClient(), ids)),
    setEventsLive: deps.setEventsLive ??
      ((ids: readonly string[], isLive: boolean) => setEventsLive(createServiceClient(), ids, isLive)),
    geocoder: deps.geocoder ?? ((address: string | null) => geocode(env("MAPBOX_TOKEN") ?? "", address, fetcher)),
    now: deps.now ?? (() => new Date().toISOString())
  };
}

async function reconcileAll(deps: RefreshDeps): Promise<RefreshSummary> {
  const d = resolveDeps(deps);
  const webflowToken = d.env("GULCH_WEBFLOW_API_KEY");
  if (!webflowToken) throw new Error("Missing GULCH_WEBFLOW_API_KEY");
  if (!d.env("MAPBOX_TOKEN")) throw new Error("Missing MAPBOX_TOKEN");

  const summary = {} as RefreshSummary;
  const existing = {
    organizers: await d.loadExisting("organizers"),
    locations: await d.loadExisting("locations"),
    events: await d.loadExisting("events"),
    shows: await d.loadExisting("shows")
  };
  const fetchedItems = {} as Record<CollectionName, WebflowItem[]>;
  let knownOrganizerIds = new Set<string>();

  for (const table of ORDER) {
    const items = await d.fetchItems(webflowToken, COLLECTIONS[table]);
    fetchedItems[table] = items;
    if (table === "organizers") knownOrganizerIds = new Set(items.map((item) => item.id));

    const result = await reconcile(items, table, {
      geocoder: d.geocoder,
      existingByIdLastUpdated: existingByIdLastUpdated(existing[table]),
      existingLocationsById: table === "locations" ? existingLocationById(existing.locations) : undefined,
      knownOrganizerIds,
      now: d.now
    });
    await upsertBatches(table, result.rows, d.upsert);

    if (table === "events") {
      const imagePendingIds = changedEventExternalLinkIds(result.rows, existingEventById(existing.events));
      const imagePending = imagePendingIds.length > 0 ? await d.markImagePending(imagePendingIds) : { updated: 0 };
      summary.imagePending = { marked: imagePending.updated };
      summary.presence = await applyPresence(existing.events, items, d.setEventsLive);
    }
    summary[table] = result.summary;
  }

  const liveEventIds = new Set((fetchedItems.events ?? []).map((item) => item.id));
  const eventOrganizers = deriveGuardedEventOrganizers(fetchedItems.events ?? [], knownOrganizerIds, liveEventIds);
  const replaced = await d.replaceAllEventOrgs(eventOrganizers.rows);
  const managingRefUpdates = reconcileManagingOrganizerRefs(
    fetchedItems.locations ?? [],
    existingLocationById(existing.locations),
    knownOrganizerIds
  );
  const managingRefs = await d.updateManagingRefs(managingRefUpdates);

  summary.eventOrganizers = {
    derived: eventOrganizers.derived,
    replaced: replaced.inserted,
    skipped: eventOrganizers.skipped
  };
  summary.managingRefs = { updated: managingRefs.updated };
  summary.imagePending ??= { marked: 0 };
  summary.presence ??= { hidden: 0, revived: 0, skipped: true, reason: "events not reconciled" };
  return summary;
}

async function applyPresence(
  existingEvents: readonly ExistingRow[],
  liveItems: readonly WebflowItem[],
  setLive: SetEventsLiveFn
): Promise<PresenceSummary> {
  const plan = planPresence(existingEvents, new Set(liveItems.map((item) => item.id)));
  const hidden = plan.toHide.length > 0 ? await setLive(plan.toHide, false) : { updated: 0 };
  const revived = plan.toRevive.length > 0 ? await setLive(plan.toRevive, true) : { updated: 0 };
  if (plan.skipped) console.warn(`presence pass skipped: ${plan.reason}`);
  return plan.skipped
    ? { hidden: hidden.updated, revived: revived.updated, skipped: true, reason: plan.reason }
    : { hidden: hidden.updated, revived: revived.updated, skipped: false };
}

export async function runRefresh(deps: RefreshDeps, source: RefreshSource): Promise<RefreshSummary> {
  const syncRuns = deps.syncRuns ?? defaultSyncRuns;
  const runId = await syncRuns.start(source);
  try {
    const summary = await reconcileAll(deps);
    await syncRuns.finish(runId, { ok: true, summary });
    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await syncRuns.finish(runId, { ok: false, error: message });
    throw error;
  }
}
