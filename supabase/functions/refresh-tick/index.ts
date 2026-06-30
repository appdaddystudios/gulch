import { constantTimeEqual, jsonResponse } from "../_shared/auth.ts";
import {
  createServiceClient,
  existingByIdLastUpdated,
  existingLocationById,
  loadExistingRows,
  type ExistingRow
} from "../_shared/db.ts";
import { geocode, type GeocodeResult } from "../_shared/geocode.ts";
import { type UpsertRow } from "../_shared/mappers.ts";
import { reconcile, type ReconcileSummary } from "../_shared/reconcile.ts";
import { COLLECTIONS, type CollectionName, type WebflowItem } from "../_shared/schemas.ts";
import { fetchLiveItems, type FetchLike } from "../_shared/webflow.ts";

type ExistingLoader = (table: CollectionName) => Promise<ExistingRow[]>;
type FetchItems = (token: string, collectionId: string) => Promise<WebflowItem[]>;
type UpsertFn = (table: CollectionName, rows: readonly UpsertRow[]) => Promise<void>;

export type RefreshDeps = {
  env?: (key: string) => string | undefined;
  fetcher?: FetchLike;
  fetchItems?: FetchItems;
  loadExisting?: ExistingLoader;
  upsert?: UpsertFn;
  geocoder?: (address: string | null) => Promise<GeocodeResult>;
  now?: () => string;
};

type Summary = Record<CollectionName, ReconcileSummary>;

const ORDER: CollectionName[] = ["locations", "events", "shows"];
const BATCH_SIZE = 500;

async function defaultLoadExisting(table: CollectionName): Promise<ExistingRow[]> {
  return loadExistingRows(createServiceClient(), table);
}

async function defaultUpsert(table: CollectionName, rows: readonly UpsertRow[]): Promise<void> {
  const { upsertRows } = await import("../_shared/db.ts");
  await upsertRows(createServiceClient(), table, rows);
}

async function upsertBatches(table: CollectionName, rows: readonly UpsertRow[], upsert: UpsertFn): Promise<void> {
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
      locations: await loadExisting("locations"),
      events: await loadExisting("events"),
      shows: await loadExisting("shows")
    };

    for (const table of ORDER) {
      const items = await fetchItems(webflowToken, COLLECTIONS[table]);
      const result = await reconcile(items, table, {
        geocoder,
        existingByIdLastUpdated: existingByIdLastUpdated(existing[table]),
        existingLocationsById: table === "locations" ? existingLocationById(existing.locations) : undefined,
        now
      });
      await upsertBatches(table, result.rows, upsert);
      summary[table] = result.summary;
    }

    return jsonResponse(summary);
  };
}

if (import.meta.main) {
  Deno.serve(createRefreshHandler());
}

