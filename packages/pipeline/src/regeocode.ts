import type { Database } from "@gulch/db";

import type { PipelineGeocoder } from "./seed";

type LocationUpdate = Database["public"]["Tables"]["locations"]["Update"];

export type RegeocodeLocation = {
  readonly webflow_item_id: string;
  readonly name_address: string;
};

type QueryResult<T> = PromiseLike<{ readonly data: T | null; readonly error: null | { readonly message: string } }>;
type MutationResult = PromiseLike<{ readonly error: null | { readonly message: string } }>;

export type RegeocodeDbClient = {
  readonly from: (table: "locations") => {
    readonly select: (columns: "webflow_item_id,name_address") => {
      readonly eq: (column: "geocode_status", value: "failed") => {
        readonly not: (column: "name_address", operator: "is", value: null) => QueryResult<readonly RegeocodeLocation[]>;
      };
    };
    readonly update: (values: LocationUpdate) => {
      readonly eq: (column: "webflow_item_id", value: string) => MutationResult;
    };
  };
};

export type RegeocodeLogger = Pick<Console, "info" | "error">;

export type RegeocodeSummary = {
  readonly scanned: number;
  readonly fixed: number;
  readonly stillFailed: number;
};

export type RunRegeocodeOptions = {
  readonly db: RegeocodeDbClient;
  readonly geocoder: PipelineGeocoder;
  readonly logger?: RegeocodeLogger;
};

export async function runRegeocode(options: RunRegeocodeOptions): Promise<RegeocodeSummary> {
  const failedLocations = await loadFailedLocations(options.db);
  let fixed = 0;
  let stillFailed = 0;

  for (const location of failedLocations) {
    const result = await options.geocoder.geocode(location.name_address);

    if (result.status !== "ok") {
      stillFailed += 1;
      continue;
    }

    await updateGeocode(options.db, location.webflow_item_id, {
      latitude: result.latitude,
      longitude: result.longitude,
      geocode_status: "ok",
      geocoded_at: new Date().toISOString()
    });
    fixed += 1;
    options.logger?.info(`Fixed geocode for ${location.webflow_item_id}`);
  }

  return { scanned: failedLocations.length, fixed, stillFailed };
}

async function loadFailedLocations(db: RegeocodeDbClient): Promise<readonly RegeocodeLocation[]> {
  const result = await db
    .from("locations")
    .select("webflow_item_id,name_address")
    .eq("geocode_status", "failed")
    .not("name_address", "is", null);

  if (result.error) {
    throw new Error(`Failed to load failed locations: ${result.error.message}`);
  }

  return result.data ?? [];
}

async function updateGeocode(
  db: RegeocodeDbClient,
  webflowItemId: string,
  values: Required<Pick<LocationUpdate, "latitude" | "longitude" | "geocode_status" | "geocoded_at">>
): Promise<void> {
  const result = await db.from("locations").update(values).eq("webflow_item_id", webflowItemId);

  if (result.error) {
    throw new Error(`Failed to update location ${webflowItemId}: ${result.error.message}`);
  }
}
