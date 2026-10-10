import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { CollectionName } from "./schemas.ts";
import type { EventOrganizerRow, EventRow, UpsertRow } from "./mappers.ts";

export type TableName = CollectionName | "event_organizers";

export type ExistingRow = {
  webflow_item_id: string;
  webflow_last_updated: string | null;
  name_address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  geocode_status?: "pending" | "ok" | "failed" | "manual" | null;
  geocoded_at?: string | null;
  managing_organizer_id?: string | null;
  external_link?: string | null;
  is_live?: boolean | null;
};

export type SyncRunSource = "cron" | "site_publish" | "manual";

export type SyncRunResult =
  | { ok: true; summary: unknown }
  | { ok: false; error: string };

export type EventImageState = {
  image_status: "pending" | "ok" | "failed" | "unavailable";
  external_link: string | null;
};

export type EventImageUpdate = {
  image_url?: string | null;
  image_status: "ok" | "failed" | "unavailable";
  image_checksum?: string;
  image_fetched_at: string;
  is_video?: boolean;
};

const UPDATE_BATCH_SIZE = 500;

export type ManagingOrganizerRefUpdate = {
  locationId: string;
  managingOrganizerId: string | null;
};

export function createServiceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Missing injected Supabase service credentials");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function upsertRows(client: SupabaseClient, table: TableName, rows: readonly UpsertRow[]): Promise<void> {
  if (rows.length === 0) return;
  const onConflict = table === "event_organizers" ? "event_id,organizer_id" : "webflow_item_id";
  const { error } = await client.from(table).upsert(rows, { onConflict });
  if (error) throw error;
}

export async function loadExistingRows(client: SupabaseClient, table: CollectionName): Promise<ExistingRow[]> {
  const columns = table === "locations"
    ? "webflow_item_id,webflow_last_updated,name_address,latitude,longitude,geocode_status,geocoded_at,managing_organizer_id"
    : table === "events"
      ? "webflow_item_id,webflow_last_updated,external_link,is_live"
    : "webflow_item_id,webflow_last_updated";
  const { data, error } = await client.from(table).select(columns);
  if (error) throw error;
  return (data ?? []) as unknown as ExistingRow[];
}

export function existingByIdLastUpdated(rows: readonly ExistingRow[]): Map<string, string | null> {
  return new Map(rows.map((row) => [row.webflow_item_id, row.webflow_last_updated]));
}

export function existingLocationById(rows: readonly ExistingRow[]): Map<string, ExistingRow> {
  return new Map(rows.map((row) => [row.webflow_item_id, row]));
}

export function existingEventById(rows: readonly ExistingRow[]): Map<string, ExistingRow> {
  return new Map(rows.map((row) => [row.webflow_item_id, row]));
}

export async function loadKnownOrganizerIds(client: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await client.from("organizers").select("webflow_item_id");
  if (error) throw error;
  const rows = (data ?? []) as unknown as { webflow_item_id: string }[];
  return new Set(rows.map((row) => row.webflow_item_id));
}

export async function replaceEventOrganizers(
  client: SupabaseClient,
  eventId: string,
  rows: readonly EventOrganizerRow[],
  knownOrganizerIds: ReadonlySet<string>
): Promise<{ inserted: number; skipped: number }> {
  const { error: deleteError } = await client.from("event_organizers").delete().eq("event_id", eventId);
  if (deleteError) throw deleteError;

  const guardedRows = rows.filter((row) => row.event_id === eventId && knownOrganizerIds.has(row.organizer_id));
  const skipped = rows.length - guardedRows.length;
  if (guardedRows.length === 0) return { inserted: 0, skipped };

  const { error: insertError } = await client.from("event_organizers").insert(guardedRows);
  if (insertError) throw insertError;
  return { inserted: guardedRows.length, skipped };
}

// keepEventIds: events a webhook observed after the calling run started.
// Their relationships are newer than the run's snapshot and are left alone;
// the caller passes rows that already exclude them.
export async function replaceAllEventOrganizers(
  client: SupabaseClient,
  rows: readonly EventOrganizerRow[],
  keepEventIds: readonly string[] = []
): Promise<{ inserted: number }> {
  const clear = client.from("event_organizers").delete().not("event_id", "is", null);
  const { error: deleteError } = await (keepEventIds.length > 0
    ? clear.not("event_id", "in", `(${keepEventIds.join(",")})`)
    : clear);
  if (deleteError) throw deleteError;

  if (rows.length === 0) return { inserted: 0 };

  // A per-event webhook may insert the same pair between the clear above and
  // this insert; a duplicate must not abort the run and leave the table empty.
  const { error: insertError } = await client
    .from("event_organizers")
    .upsert(rows, { onConflict: "event_id,organizer_id", ignoreDuplicates: true });
  if (insertError) throw insertError;
  return { inserted: rows.length };
}

export async function updateLocationManagingOrganizerRefs(
  client: SupabaseClient,
  updates: readonly ManagingOrganizerRefUpdate[]
): Promise<{ updated: number }> {
  for (const update of updates) {
    const { error } = await client
      .from("locations")
      .update({ managing_organizer_id: update.managingOrganizerId })
      .eq("webflow_item_id", update.locationId);
    if (error) throw error;
  }

  return { updated: updates.length };
}

// Observation-ordered writes. Writers that mirror Webflow state into events
// overlap freely: concurrent webhook deliveries, a site_publish reconcile
// beside a per-item publish, the cron. Each stamps the time it observed the
// state it is applying (fetch start for reads, receipt time for unpublish
// webhooks) and only lands when the row holds no newer observation, so the
// row ends at the most recently observed state, not the most recently
// written one. A writer whose observation lost should stop there.
function notObservedAfter(observedAt: string): string {
  return `observed_at.is.null,observed_at.lte.${observedAt}`;
}

export async function setEventsLive(
  client: SupabaseClient,
  ids: readonly string[],
  isLive: boolean,
  observedAt: string
): Promise<{ updated: number }> {
  let updated = 0;
  for (let index = 0; index < ids.length; index += UPDATE_BATCH_SIZE) {
    const batch = ids.slice(index, index + UPDATE_BATCH_SIZE);
    const { data, error } = await client
      .from("events")
      .update({ is_live: isLive, observed_at: observedAt })
      .in("webflow_item_id", batch)
      .or(notObservedAfter(observedAt))
      .select("webflow_item_id");
    if (error) throw error;
    updated += data?.length ?? 0;
  }
  return { updated };
}

export async function loadEventIdsObservedAfter(client: SupabaseClient, observedAt: string): Promise<string[]> {
  const { data, error } = await client.from("events").select("webflow_item_id").gt("observed_at", observedAt);
  if (error) throw error;
  return ((data ?? []) as { webflow_item_id: string }[]).map((row) => row.webflow_item_id);
}

export type EventWriteResult = { inserted: number; updated: number; stale: number; pendingMarked: number };

// New rows are inserted as observed (a row that appears meanwhile wins by
// being first). Existing rows take a conditional update; ids in pendingIds
// also get image_status = pending inside that same ordered write, so a link
// change can neither be lost to the row write nor reset a newer result.
export async function applyEventRows(
  client: SupabaseClient,
  rows: readonly EventRow[],
  observedAt: string,
  pendingIds: ReadonlySet<string>
): Promise<EventWriteResult> {
  const insertedIds = await insertEventsIfAbsent(client, rows, observedAt);
  let updated = 0;
  let stale = 0;
  let pendingMarked = 0;

  for (const row of rows) {
    if (insertedIds.has(row.webflow_item_id)) continue;
    const markPending = pendingIds.has(row.webflow_item_id);
    const fields = markPending
      ? { ...row, observed_at: observedAt, image_status: "pending" }
      : { ...row, observed_at: observedAt };
    const { data, error } = await client
      .from("events")
      .update(fields)
      .eq("webflow_item_id", row.webflow_item_id)
      .or(notObservedAfter(observedAt))
      .select("webflow_item_id");
    if (error) throw error;
    if ((data?.length ?? 0) === 0) {
      stale += 1;
      continue;
    }
    updated += 1;
    if (markPending) pendingMarked += 1;
  }

  return { inserted: insertedIds.size, updated, stale, pendingMarked };
}

async function insertEventsIfAbsent(
  client: SupabaseClient,
  rows: readonly EventRow[],
  observedAt: string
): Promise<Set<string>> {
  const inserted = new Set<string>();
  for (let index = 0; index < rows.length; index += UPDATE_BATCH_SIZE) {
    const batch = rows.slice(index, index + UPDATE_BATCH_SIZE).map((row) => ({ ...row, observed_at: observedAt }));
    const { data, error } = await client
      .from("events")
      .upsert(batch, { onConflict: "webflow_item_id", ignoreDuplicates: true })
      .select("webflow_item_id");
    if (error) throw error;
    for (const row of (data ?? []) as { webflow_item_id: string }[]) inserted.add(row.webflow_item_id);
  }
  return inserted;
}

export async function startSyncRun(client: SupabaseClient, source: SyncRunSource): Promise<number> {
  const { data, error } = await client.from("sync_runs").insert({ source }).select("id").single();
  if (error) throw error;
  return (data as { id: number }).id;
}

export async function finishSyncRun(client: SupabaseClient, id: number, result: SyncRunResult): Promise<void> {
  const fields = result.ok
    ? { finished_at: new Date().toISOString(), ok: true, summary: result.summary }
    : { finished_at: new Date().toISOString(), ok: false, error: result.error };
  const { error } = await client.from("sync_runs").update(fields).eq("id", id);
  if (error) throw error;
}

export async function lastSyncRunStartedAt(client: SupabaseClient, source: SyncRunSource): Promise<string | null> {
  const { data, error } = await client
    .from("sync_runs")
    .select("started_at")
    .eq("source", source)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as { started_at: string } | null)?.started_at ?? null;
}

export async function loadEventImageState(client: SupabaseClient, eventId: string): Promise<EventImageState | null> {
  const { data, error } = await client
    .from("events")
    .select("image_status,external_link")
    .eq("webflow_item_id", eventId)
    .maybeSingle();
  if (error) throw error;
  return (data as EventImageState | null) ?? null;
}

// Guarded by the link the image was fetched for: with overlapping workers
// (two publishes, or webhook + images job) the one for an older link may
// finish last and must not win. Returns false when the row no longer matches.
export async function updateEventImage(
  client: SupabaseClient,
  eventId: string,
  fields: EventImageUpdate,
  expectedExternalLink: string | null
): Promise<boolean> {
  const base = client.from("events").update(fields).eq("webflow_item_id", eventId);
  const byLink = expectedExternalLink === null
    ? base.is("external_link", null)
    : base.eq("external_link", expectedExternalLink);
  // A failure says the attempt failed, not that the stored hero is wrong: a
  // slower same-link worker must never demote an ok row.
  const guarded = fields.image_status === "ok" ? byLink : byLink.neq("image_status", "ok");
  const { data, error } = await guarded.select("webflow_item_id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

