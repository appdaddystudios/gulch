import { constantTimeEqual, jsonResponse } from "../_shared/auth.ts";
import {
  createServiceClient,
  existingByIdLastUpdated,
  existingLocationById,
  loadKnownOrganizerIds,
  loadExistingRows,
  replaceEventOrganizers,
  type TableName,
  type ExistingRow
} from "../_shared/db.ts";
import { geocode, type GeocodeResult } from "../_shared/geocode.ts";
import { type EventOrganizerRow, type UpsertRow } from "../_shared/mappers.ts";
import { reconcile, type ReconcileSummary } from "../_shared/reconcile.ts";
import { COLLECTIONS, type CollectionName, type WebflowItem } from "../_shared/schemas.ts";
import { fetchLiveItems, type FetchLike } from "../_shared/webflow.ts";

type ExistingLoader = (table: CollectionName) => Promise<ExistingRow[]>;
type FetchItems = (token: string, collectionId: string) => Promise<WebflowItem[]>;
type UpsertFn = (table: TableName, rows: readonly UpsertRow[]) => Promise<void>;
type ReplaceEventOrganizersFn = (
  eventId: string,
  rows: readonly EventOrganizerRow[],
  knownOrganizerIds: ReadonlySet<string>
) => Promise<{ inserted: number; skipped: number }>;

export type RefreshDeps = {
  env?: (key: string) => string | undefined;
  fetcher?: FetchLike;
  fetchItems?: FetchItems;
  loadExisting?: ExistingLoader;
  loadKnownOrganizerIds?: () => Promise<Set<string>>;
  upsert?: UpsertFn;
  replaceEventOrganizers?: ReplaceEventOrganizersFn;
  geocoder?: (address: string | null) => Promise<GeocodeResult>;
  now?: () => string;
};

type Summary = Record<CollectionName, ReconcileSummary> & {
  eventOrganizers: { replaced: number; inserted: number; skipped: number };
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
  const loadOrganizerIds = deps.loadKnownOrganizerIds ?? defaultLoadKnownOrganizerIds;
  const upsert = deps.upsert ?? defaultUpsert;
  const replaceEventOrgs = deps.replaceEventOrganizers ?? defaultReplaceEventOrganizers;
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
    let knownOrganizerIds = await loadOrganizerIds();
    const eventOrganizersSummary = { replaced: 0, inserted: 0, skipped: 0 };

    for (const table of ORDER) {
      const items = await fetchItems(webflowToken, COLLECTIONS[table]);
      const result = await reconcile(items, table, {
        geocoder,
        existingByIdLastUpdated: existingByIdLastUpdated(existing[table]),
        existingLocationsById: table === "locations" ? existingLocationById(existing.locations) : undefined,
        knownOrganizerIds,
        now
      });
      await upsertBatches(table, result.rows, upsert);
      summary[table] = result.summary;

      if (table === "organizers") {
        knownOrganizerIds = new Set([
          ...knownOrganizerIds,
          ...result.rows.map((row) => row.webflow_item_id)
        ]);
      }

      if (table === "events") {
        for (const replacement of result.eventOrganizerReplacements ?? []) {
          const replaced = await replaceEventOrgs(replacement.eventId, replacement.rows, knownOrganizerIds);
          eventOrganizersSummary.replaced += 1;
          eventOrganizersSummary.inserted += replaced.inserted;
          eventOrganizersSummary.skipped += replacement.skipped + replaced.skipped;
        }
      }
    }

    summary.eventOrganizers = eventOrganizersSummary;
    return jsonResponse(summary);
  };
}

if (import.meta.main) {
  Deno.serve(createRefreshHandler());
}
