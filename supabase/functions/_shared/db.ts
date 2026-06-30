import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { CollectionName } from "./schemas.ts";
import type { EventOrganizerRow, UpsertRow } from "./mappers.ts";

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
};

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
      ? "webflow_item_id,webflow_last_updated,external_link"
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

export async function replaceAllEventOrganizers(
  client: SupabaseClient,
  rows: readonly EventOrganizerRow[]
): Promise<{ inserted: number }> {
  const { error: deleteError } = await client.from("event_organizers").delete().not("event_id", "is", null);
  if (deleteError) throw deleteError;

  if (rows.length === 0) return { inserted: 0 };

  const { error: insertError } = await client.from("event_organizers").insert(rows);
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
