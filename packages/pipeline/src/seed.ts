import type { Database } from "@gulch/db";
import { deriveEventOrganizers, mapEvent, mapLocation, mapOrganizer, mapShow } from "@gulch/shared";

import { WEBFLOW_COLLECTION_IDS } from "./webflow-client";

export { WEBFLOW_COLLECTION_IDS } from "./webflow-client";

type TableName = "organizers" | "locations" | "events" | "shows" | "event_organizers";
type LocationInsert = Database["public"]["Tables"]["locations"]["Insert"];
type EventInsert = Database["public"]["Tables"]["events"]["Insert"];
type OrganizerInsert = Database["public"]["Tables"]["organizers"]["Insert"];
type EventOrganizerInsert = Database["public"]["Tables"]["event_organizers"]["Insert"];
type ShowInsert = Database["public"]["Tables"]["shows"]["Insert"];
type PipelineInsert = LocationInsert | EventInsert | OrganizerInsert | EventOrganizerInsert | ShowInsert;
type UpsertConflict = "webflow_item_id" | "event_id,organizer_id";

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
      rows: readonly PipelineInsert[],
      options: { readonly onConflict: UpsertConflict }
    ) => PromiseLike<{ readonly error: null | { readonly message: string } }>;
  };
};

export type SeedLogger = Pick<Console, "info" | "error">;

export type SeedSummary = {
  readonly organizers: {
    readonly fetched: number;
    readonly upserted: number;
  };
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
  readonly eventOrganizers: {
    readonly derived: number;
    readonly upserted: number;
    readonly skipped: number;
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
  options.logger?.info("Fetching organizers");
  const rawOrganizers = await fetchCollection(options.webflow, "organizers", WEBFLOW_COLLECTION_IDS.organizers);
  const organizers = rawOrganizers.map((raw) => mapWithStage("organizers", "map", () => mapOrganizer(raw)));
  await upsertRows(options.db, "organizers", organizers);
  const knownOrganizerIds = new Set(organizers.map((organizer) => organizer.webflow_item_id));

  options.logger?.info("Fetching locations");
  const rawLocations = await fetchCollection(options.webflow, "locations", WEBFLOW_COLLECTION_IDS.locations);
  const locations = await mapAndGeocodeLocations(rawLocations, options.geocoder, knownOrganizerIds, options.logger);
  await upsertRows(options.db, "locations", locations.rows);

  options.logger?.info("Fetching events");
  const rawEvents = await fetchCollection(options.webflow, "events", WEBFLOW_COLLECTION_IDS.events);
  const events = rawEvents.map((raw) => mapWithStage("events", "map", () => mapEvent(raw)));
  await upsertRows(options.db, "events", events);
  const knownEventIds = new Set(events.map((event) => event.webflow_item_id));

  options.logger?.info("Fetching shows");
  const rawShows = await fetchCollection(options.webflow, "shows", WEBFLOW_COLLECTION_IDS.shows);
  const shows = rawShows.map((raw) => mapWithStage("shows", "map", () => mapShow(raw)));
  await upsertRows(options.db, "shows", shows);

  const eventOrganizers = deriveAndGuardEventOrganizers(rawEvents, knownOrganizerIds, knownEventIds, options.logger);
  await upsertRows(options.db, "event_organizers", eventOrganizers.rows);

  return {
    organizers: {
      fetched: rawOrganizers.length,
      upserted: organizers.length
    },
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
    },
    eventOrganizers: {
      derived: eventOrganizers.derived,
      upserted: eventOrganizers.rows.length,
      skipped: eventOrganizers.skipped
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
  geocoder: PipelineGeocoder,
  knownOrganizerIds: ReadonlySet<string>,
  logger?: SeedLogger
): Promise<{
  readonly rows: readonly LocationInsert[];
  readonly geocoded: number;
  readonly geocodeFailed: number;
}> {
  let geocoded = 0;
  let geocodeFailed = 0;
  let danglingManagingOrganizers = 0;
  const rows: LocationInsert[] = [];

  for (const raw of rawLocations) {
    const mappedLocation = mapWithStage("locations", "map", () => mapLocation(raw));
    const mapped =
      mappedLocation.managing_organizer_id && !knownOrganizerIds.has(mappedLocation.managing_organizer_id)
        ? { ...mappedLocation, managing_organizer_id: null }
        : mappedLocation;

    if (mappedLocation.managing_organizer_id && mapped.managing_organizer_id === null) {
      danglingManagingOrganizers += 1;
    }

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

  if (danglingManagingOrganizers > 0) {
    logger?.info(`Nulling ${danglingManagingOrganizers} dangling location managing organizer reference`);
  }

  return { rows, geocoded, geocodeFailed };
}

function deriveAndGuardEventOrganizers(
  rawEvents: readonly unknown[],
  knownOrganizerIds: ReadonlySet<string>,
  knownEventIds: ReadonlySet<string>,
  logger?: SeedLogger
): { readonly rows: readonly EventOrganizerInsert[]; readonly derived: number; readonly skipped: number } {
  const derivedRows = rawEvents.flatMap((raw) =>
    mapWithStage("event_organizers", "derive", () => deriveEventOrganizers(raw))
  );
  const rows = derivedRows.filter(
    (row) => knownOrganizerIds.has(row.organizer_id) && knownEventIds.has(row.event_id)
  );
  const skipped = derivedRows.length - rows.length;

  if (skipped > 0) {
    logger?.info(`Skipping ${skipped} dangling event organizer reference`);
  }

  return { rows, derived: derivedRows.length, skipped };
}

async function upsertRows(
  db: PipelineDbClient,
  table: TableName,
  rows: readonly PipelineInsert[]
): Promise<void> {
  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize);

    try {
      const result = await db.from(table).upsert(batch, { onConflict: conflictTargetFor(table) });
      if (result.error) {
        throw new Error(result.error.message);
      }
    } catch (error) {
      throw withStage(table, "upsert", error);
    }
  }
}

function conflictTargetFor(table: TableName): UpsertConflict {
  return table === "event_organizers" ? "event_id,organizer_id" : "webflow_item_id";
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
