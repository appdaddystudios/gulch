import type { Database } from "@gulch/db";
import { mapEvent, mapLocation, mapShow } from "@gulch/shared";

type TableName = "locations" | "events" | "shows";
type LocationInsert = Database["public"]["Tables"]["locations"]["Insert"];
type EventInsert = Database["public"]["Tables"]["events"]["Insert"];
type ShowInsert = Database["public"]["Tables"]["shows"]["Insert"];

export const WEBFLOW_COLLECTION_IDS = {
  locations: "6843bee91e942f36fd3adc06",
  events: "6845d39c294d60e4c197cee9",
  shows: "6865fb691dda49a9c7043754"
} as const;

export type PipelineWebflowClient = {
  readonly fetchAllItems: (collectionId: string) => Promise<readonly unknown[]>;
};

export type PipelineGeocoder = {
  readonly geocode: (
    address: string
  ) => Promise<
    | { readonly latitude: number; readonly longitude: number; readonly status: "ok" }
    | { readonly latitude: null; readonly longitude: null; readonly status: "failed" }
  >;
};

export type PipelineDbClient = {
  readonly from: (table: TableName) => {
    readonly upsert: (
      rows: readonly (LocationInsert | EventInsert | ShowInsert)[],
      options: { readonly onConflict: "webflow_item_id" }
    ) => PromiseLike<{ readonly error: null | { readonly message: string } }>;
  };
};

export type SeedLogger = Pick<Console, "info" | "error">;

export type SeedSummary = {
  readonly locations: {
    readonly fetched: number;
    readonly upserted: number;
    readonly geocoded: number;
    readonly geocodeFailed: number;
  };
  readonly events: {
    readonly fetched: number;
    readonly upserted: number;
  };
  readonly shows: {
    readonly fetched: number;
    readonly upserted: number;
  };
};

export type RunSeedOptions = {
  readonly webflow: PipelineWebflowClient;
  readonly geocoder: PipelineGeocoder;
  readonly db: PipelineDbClient;
  readonly logger?: SeedLogger;
};

const batchSize = 500;

export async function runSeed(options: RunSeedOptions): Promise<SeedSummary> {
  options.logger?.info("Fetching locations");
  const rawLocations = await fetchCollection(options.webflow, "locations", WEBFLOW_COLLECTION_IDS.locations);
  const locations = await mapAndGeocodeLocations(rawLocations, options.geocoder);
  await upsertRows(options.db, "locations", locations.rows);

  options.logger?.info("Fetching events");
  const rawEvents = await fetchCollection(options.webflow, "events", WEBFLOW_COLLECTION_IDS.events);
  const events = rawEvents.map((raw) => mapWithStage("events", "map", () => mapEvent(raw)));
  await upsertRows(options.db, "events", events);

  options.logger?.info("Fetching shows");
  const rawShows = await fetchCollection(options.webflow, "shows", WEBFLOW_COLLECTION_IDS.shows);
  const shows = rawShows.map((raw) => mapWithStage("shows", "map", () => mapShow(raw)));
  await upsertRows(options.db, "shows", shows);

  return {
    locations: {
      fetched: rawLocations.length,
      upserted: locations.rows.length,
      geocoded: locations.geocoded,
      geocodeFailed: locations.geocodeFailed
    },
    events: {
      fetched: rawEvents.length,
      upserted: events.length
    },
    shows: {
      fetched: rawShows.length,
      upserted: shows.length
    }
  };
}

async function fetchCollection(
  webflow: PipelineWebflowClient,
  table: TableName,
  collectionId: string
): Promise<readonly unknown[]> {
  try {
    return await webflow.fetchAllItems(collectionId);
  } catch (error) {
    throw withStage(table, "fetch", error);
  }
}

async function mapAndGeocodeLocations(
  rawLocations: readonly unknown[],
  geocoder: PipelineGeocoder
): Promise<{ readonly rows: readonly LocationInsert[]; readonly geocoded: number; readonly geocodeFailed: number }> {
  let geocoded = 0;
  let geocodeFailed = 0;
  const rows: LocationInsert[] = [];

  for (const raw of rawLocations) {
    const mapped = mapWithStage("locations", "map", () => mapLocation(raw));

    if (mapped.name_address === null || mapped.name_address === undefined) {
      rows.push({ ...mapped, latitude: null, longitude: null, geocode_status: "pending" });
      continue;
    }

    try {
      const result = await geocoder.geocode(mapped.name_address);
      if (result.status === "ok") {
        geocoded += 1;
      } else {
        geocodeFailed += 1;
      }

      rows.push({
        ...mapped,
        latitude: result.latitude,
        longitude: result.longitude,
        geocode_status: result.status
      });
    } catch (error) {
      throw withStage("locations", "geocode", error);
    }
  }

  return { rows, geocoded, geocodeFailed };
}

async function upsertRows(
  db: PipelineDbClient,
  table: TableName,
  rows: readonly (LocationInsert | EventInsert | ShowInsert)[]
): Promise<void> {
  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize);

    try {
      const result = await db.from(table).upsert(batch, { onConflict: "webflow_item_id" });
      if (result.error) {
        throw new Error(result.error.message);
      }
    } catch (error) {
      throw withStage(table, "upsert", error);
    }
  }
}

function mapWithStage<T>(table: TableName, stage: string, mapper: () => T): T {
  try {
    return mapper();
  } catch (error) {
    throw withStage(table, stage, error);
  }
}

function withStage(table: TableName, stage: string, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`Seed failed during ${table} ${stage}: ${message}`);
}
