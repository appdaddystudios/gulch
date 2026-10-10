// One full reconcile against Webflow's live collections. Shared by the
// scheduled refresh-tick and the site_publish webhook so both run the same
// code and both leave a sync_runs row behind.
import {
  applyEventRows,
  createServiceClient,
  existingByIdLastUpdated,
  existingEventById,
  existingLocationById,
  finishSyncRun,
  loadEventIdsObservedAfter,
  loadExistingRows,
  replaceAllEventOrganizers,
  setEventsLive,
  startSyncRun,
  updateLocationManagingOrganizerRefs,
  upsertRows,
  type EventWriteResult,
  type ExistingRow,
  type ManagingOrganizerRefUpdate,
  type SyncRunResult,
  type SyncRunSource,
  type TableName
} from "./db.ts";
import { geocode, type GeocodeResult } from "./geocode.ts";
import { type EventOrganizerRow, type EventRow, type UpsertRow } from "./mappers.ts";
import {
  deriveGuardedEventOrganizers,
  planPresence,
  reconcile,
  reconcileManagingOrganizerRefs,
  type ReconcileSummary
} from "./reconcile.ts";
import { COLLECTIONS, type CollectionName, type WebflowItem } from "./schemas.ts";
import { fetchLiveItem, fetchLiveItems, type FetchLike } from "./webflow.ts";

export type RefreshSource = SyncRunSource;

type ExistingLoader = (table: CollectionName) => Promise<ExistingRow[]>;
type FetchItems = (token: string, collectionId: string) => Promise<WebflowItem[]>;
type FetchItem = (token: string, collectionId: string, itemId: string) => Promise<WebflowItem | null>;
type UpsertFn = (table: TableName, rows: readonly UpsertRow[]) => Promise<void>;
type ReplaceAllEventOrganizersFn = (
  rows: readonly EventOrganizerRow[],
  keepEventIds: readonly string[]
) => Promise<{ inserted: number }>;
type LoadEventIdsObservedAfterFn = (observedAt: string) => Promise<string[]>;
type UpdateManagingOrganizerRefsFn = (
  updates: readonly ManagingOrganizerRefUpdate[]
) => Promise<{ updated: number }>;
type ApplyEventRowsFn = (
  rows: readonly EventRow[],
  observedAt: string,
  pendingIds: ReadonlySet<string>
) => Promise<EventWriteResult>;
type SetEventsLiveFn = (ids: readonly string[], isLive: boolean, observedAt: string) => Promise<{ updated: number }>;

export type SyncRunsStore = {
  start: (source: SyncRunSource) => Promise<number | null>;
  finish: (id: number | null, result: SyncRunResult) => Promise<void>;
};

export type RefreshDeps = {
  env?: (key: string) => string | undefined;
  fetcher?: FetchLike;
  fetchItems?: FetchItems;
  fetchItem?: FetchItem;
  loadExisting?: ExistingLoader;
  upsert?: UpsertFn;
  replaceAllEventOrganizers?: ReplaceAllEventOrganizersFn;
  loadEventIdsObservedAfter?: LoadEventIdsObservedAfterFn;
  updateManagingOrganizerRefs?: UpdateManagingOrganizerRefsFn;
  applyEventRows?: ApplyEventRowsFn;
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
  // stale = event rows whose observation lost to a newer write (see applyEventRows);
  // hiddenAfterInsert = inserted rows found already unpublished on re-read.
  eventWrites: { inserted: number; updated: number; stale: number; hiddenAfterInsert: number };
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
    fetchItem: deps.fetchItem ?? ((token, collectionId, itemId) => fetchLiveItem(token, collectionId, itemId, fetcher)),
    loadExisting: deps.loadExisting ?? defaultLoadExisting,
    upsert: deps.upsert ?? defaultUpsert,
    replaceAllEventOrgs: deps.replaceAllEventOrganizers ??
      ((rows: readonly EventOrganizerRow[], keepEventIds: readonly string[]) =>
        replaceAllEventOrganizers(createServiceClient(), rows, keepEventIds)),
    loadEventIdsObservedAfter: deps.loadEventIdsObservedAfter ??
      ((observedAt: string) => loadEventIdsObservedAfter(createServiceClient(), observedAt)),
    updateManagingRefs: deps.updateManagingOrganizerRefs ??
      ((updates: readonly ManagingOrganizerRefUpdate[]) =>
        updateLocationManagingOrganizerRefs(createServiceClient(), updates)),
    applyEventRows: deps.applyEventRows ??
      ((rows: readonly EventRow[], observedAt: string, pendingIds: ReadonlySet<string>) =>
        applyEventRows(createServiceClient(), rows, observedAt, pendingIds)),
    setEventsLive: deps.setEventsLive ??
      ((ids: readonly string[], isLive: boolean, observedAt: string) =>
        setEventsLive(createServiceClient(), ids, isLive, observedAt)),
    geocoder: deps.geocoder ?? ((address: string | null) => geocode(env("MAPBOX_TOKEN") ?? "", address, fetcher)),
    now: deps.now ?? (() => new Date().toISOString())
  };
}

async function reconcileAll(deps: RefreshDeps): Promise<RefreshSummary> {
  const d = resolveDeps(deps);
  const webflowToken = d.env("GULCH_WEBFLOW_API_KEY");
  if (!webflowToken) throw new Error("Missing GULCH_WEBFLOW_API_KEY");
  if (!d.env("MAPBOX_TOKEN")) throw new Error("Missing MAPBOX_TOKEN");

  // Taken before any Webflow read: everything this run observes is at least
  // this new, so a webhook received later carries a newer observation and
  // wins over this run's writes.
  const observedAt = d.now();
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
    if (table === "events") {
      const eventRows = result.rows as EventRow[];
      const pendingIds = new Set(changedEventExternalLinkIds(eventRows, existingEventById(existing.events)));
      const writes = await d.applyEventRows(eventRows, observedAt, pendingIds);
      const hiddenAfterInsert = await hideInsertedIfGone(d, webflowToken, writes.insertedIds);
      summary.eventWrites = {
        inserted: writes.insertedIds.length,
        updated: writes.updated,
        stale: writes.stale,
        hiddenAfterInsert
      };
      summary.imagePending = { marked: writes.pendingMarked };
      summary.presence = await applyPresence(existing.events, items, d.setEventsLive, observedAt);
    } else {
      await upsertBatches(table, result.rows, d.upsert);
    }
    summary[table] = result.summary;
  }

  const liveEventIds = new Set((fetchedItems.events ?? []).map((item) => item.id));
  const eventOrganizers = deriveGuardedEventOrganizers(fetchedItems.events ?? [], knownOrganizerIds, liveEventIds);
  // Events a webhook observed after this run started hold newer relationships
  // than this snapshot; leave them out of the replacement entirely.
  const newerIds = new Set(await d.loadEventIdsObservedAfter(observedAt));
  const organizerRows = eventOrganizers.rows.filter((row) => !newerIds.has(row.event_id));
  const replaced = await d.replaceAllEventOrgs(organizerRows, [...newerIds]);
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
  summary.eventWrites ??= { inserted: 0, updated: 0, stale: 0, hiddenAfterInsert: 0 };
  summary.imagePending ??= { marked: 0 };
  summary.presence ??= { hidden: 0, revived: 0, skipped: true, reason: "events not reconciled" };
  return summary;
}

type Resolved = ReturnType<typeof resolveDeps>;

// A row this run inserted carried no observation an earlier unpublish could
// have beaten (a hide that found no row left nothing behind). Re-read each
// inserted item once, with a fresh observation, and hide it if already gone.
async function hideInsertedIfGone(d: Resolved, token: string, insertedIds: readonly string[]): Promise<number> {
  let hidden = 0;
  for (const id of insertedIds) {
    const observedAt = d.now();
    if (await d.fetchItem(token, COLLECTIONS.events, id)) continue;
    const { updated } = await d.setEventsLive([id], false, observedAt);
    hidden += updated;
  }
  return hidden;
}

async function applyPresence(
  existingEvents: readonly ExistingRow[],
  liveItems: readonly WebflowItem[],
  setLive: SetEventsLiveFn,
  observedAt: string
): Promise<PresenceSummary> {
  const plan = planPresence(existingEvents, new Set(liveItems.map((item) => item.id)));
  const hidden = plan.toHide.length > 0 ? await setLive(plan.toHide, false, observedAt) : { updated: 0 };
  const revived = plan.toRevive.length > 0 ? await setLive(plan.toRevive, true, observedAt) : { updated: 0 };
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
