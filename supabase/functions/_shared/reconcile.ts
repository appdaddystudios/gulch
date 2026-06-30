import { type ExistingRow } from "./db.ts";
import { type GeocodeResult } from "./geocode.ts";
import {
  deriveEventOrganizers,
  mapEvent,
  mapLocation,
  mapOrganizer,
  mapShow,
  type EventOrganizerRow,
  type EventRow,
  type LocationRow,
  type OrganizerRow,
  type ShowRow
} from "./mappers.ts";
import type { CollectionName, WebflowItem } from "./schemas.ts";

export type ReconcileSummary = {
  scanned: number;
  upserted: number;
  geocoded: number;
  failed: number;
};

export type EventOrganizerReplacement = {
  eventId: string;
  rows: EventOrganizerRow[];
  skipped: number;
};

export type ReconcileResult<T extends LocationRow | EventRow | OrganizerRow | ShowRow> = {
  rows: T[];
  summary: ReconcileSummary;
  eventOrganizerReplacements?: EventOrganizerReplacement[];
};

export type ReconcileOptions = {
  geocoder: (address: string | null) => Promise<GeocodeResult>;
  existingByIdLastUpdated: ReadonlyMap<string, string | null>;
  existingLocationsById?: ReadonlyMap<string, ExistingRow>;
  knownOrganizerIds?: ReadonlySet<string>;
  now?: () => string;
};

function changed(item: WebflowItem, existing: ReadonlyMap<string, string | null>): boolean {
  return existing.get(item.id) !== item.lastUpdated;
}

async function reconcileLocations(rawItems: readonly WebflowItem[], options: ReconcileOptions): Promise<ReconcileResult<LocationRow>> {
  const rows: LocationRow[] = [];
  let geocoded = 0;
  let failed = 0;
  const now = options.now ?? (() => new Date().toISOString());

  for (const item of rawItems) {
    if (!changed(item, options.existingByIdLastUpdated)) continue;

    const mapped = mapLocation(item);
    const row =
      mapped.managing_organizer_id &&
        options.knownOrganizerIds !== undefined &&
        !options.knownOrganizerIds.has(mapped.managing_organizer_id)
        ? { ...mapped, managing_organizer_id: null }
        : mapped;
    const existing = options.existingLocationsById?.get(row.webflow_item_id);
    const addressChanged = !existing || existing.name_address !== row.name_address;

    if (addressChanged) {
      const result = await options.geocoder(row.name_address);
      row.latitude = result.latitude;
      row.longitude = result.longitude;
      row.geocode_status = result.status;
      row.geocoded_at = result.status === "ok" ? now() : null;
      if (result.status !== "pending") geocoded += 1;
      if (result.status === "failed") failed += 1;
    } else {
      row.latitude = existing.latitude ?? null;
      row.longitude = existing.longitude ?? null;
      row.geocode_status = existing.geocode_status ?? "pending";
      row.geocoded_at = existing.geocoded_at ?? null;
    }

    rows.push(row);
  }

  return { rows, summary: { scanned: rawItems.length, upserted: rows.length, geocoded, failed } };
}

export async function reconcile(
  rawItems: readonly WebflowItem[],
  collection: CollectionName,
  options: ReconcileOptions
): Promise<ReconcileResult<LocationRow | EventRow | OrganizerRow | ShowRow>> {
  if (collection === "locations") return reconcileLocations(rawItems, options);

  const changedItems = rawItems.filter((item) => changed(item, options.existingByIdLastUpdated));
  const rows = changedItems.map((item) => {
    if (collection === "organizers") return mapOrganizer(item);
    if (collection === "events") return mapEvent(item);
    return mapShow(item);
  });
  const eventOrganizerReplacements = collection === "events"
    ? changedItems.map((item) => {
      const derivedRows = deriveEventOrganizers(item);
      const rows = derivedRows.filter((row) =>
        row.event_id === item.id && (options.knownOrganizerIds?.has(row.organizer_id) ?? false)
      );
      return { eventId: item.id, rows, skipped: derivedRows.length - rows.length };
    })
    : undefined;

  return {
    rows,
    summary: { scanned: rawItems.length, upserted: rows.length, geocoded: 0, failed: 0 },
    eventOrganizerReplacements
  };
}
