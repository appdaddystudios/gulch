import { type ExistingRow, type ManagingOrganizerRefUpdate } from "./db.ts";
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

// PostgREST returns timestamptz as `...+00:00`, Webflow as `...Z`; compare
// instants, not strings, or every row looks changed on every run.
const toEpoch = (value: string | null | undefined): number => (value ? Date.parse(value) : Number.NaN);

export function changed(item: WebflowItem, existing: ReadonlyMap<string, string | null>): boolean {
  return toEpoch(existing.get(item.id)) !== toEpoch(item.lastUpdated);
}

export type PresencePlan = {
  toHide: string[];
  toRevive: string[];
  // Hides beyond this run's guarded batch; they converge over later runs.
  deferred: number;
  skipped: boolean;
  reason?: string;
};

// Never hide more than this share of rows in one run, an empty live set
// included: a short or empty Webflow response can cost at most one batch,
// and reviving is unguarded so the next good run restores it.
export const PRESENCE_GUARD_MIN = 25;
export const PRESENCE_GUARD_SHARE = 0.1;

// The live set from Webflow is the truth for events: absent → not live,
// present again → live (an unpublish + re-publish without edits leaves
// lastUpdated untouched, so the upsert path alone would never revive it).
export function planPresence(existing: readonly ExistingRow[], liveIds: ReadonlySet<string>): PresencePlan {
  const toHide = existing
    .filter((row) => row.is_live !== false && !liveIds.has(row.webflow_item_id))
    .map((row) => row.webflow_item_id);
  const toRevive = existing
    .filter((row) => row.is_live === false && liveIds.has(row.webflow_item_id))
    .map((row) => row.webflow_item_id);
  // Hide at most one guarded batch per run. A bad snapshot can then hide no
  // more than this, and revives are unguarded so the next good run undoes
  // it; a legitimately large set converges over runs instead of being
  // skipped forever. Rows arrive ordered by id, so successive runs progress.
  const limit = Math.max(PRESENCE_GUARD_MIN, Math.floor(existing.length * PRESENCE_GUARD_SHARE));
  const deferred = Math.max(0, toHide.length - limit);
  return { toHide: toHide.slice(0, limit), toRevive, deferred, skipped: false };
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

export function deriveGuardedEventOrganizers(
  rawEvents: readonly WebflowItem[],
  knownOrganizerIds: ReadonlySet<string>,
  knownEventIds: ReadonlySet<string>
): { rows: EventOrganizerRow[]; derived: number; skipped: number } {
  const derivedRows = rawEvents.flatMap((item) => deriveEventOrganizers(item));
  const rows = derivedRows.filter((row) => knownOrganizerIds.has(row.organizer_id) && knownEventIds.has(row.event_id));

  return { rows, derived: derivedRows.length, skipped: derivedRows.length - rows.length };
}

export function reconcileManagingOrganizerRefs(
  rawLocations: readonly WebflowItem[],
  existingLocationsById: ReadonlyMap<string, ExistingRow>,
  knownOrganizerIds: ReadonlySet<string>
): ManagingOrganizerRefUpdate[] {
  return rawLocations.flatMap((item) => {
    const row = mapLocation(item);
    const computed = row.managing_organizer_id && knownOrganizerIds.has(row.managing_organizer_id)
      ? row.managing_organizer_id
      : null;
    const existing = existingLocationsById.get(row.webflow_item_id);

    if (!existing || (existing.managing_organizer_id ?? null) === computed) {
      return [];
    }

    return [{ locationId: row.webflow_item_id, managingOrganizerId: computed }];
  });
}
