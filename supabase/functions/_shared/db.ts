import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { CollectionName } from "./schemas.ts";
import type { UpsertRow } from "./mappers.ts";

export type ExistingRow = {
  webflow_item_id: string;
  webflow_last_updated: string | null;
  name_address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  geocode_status?: "pending" | "ok" | "failed" | "manual" | null;
  geocoded_at?: string | null;
};

export function createServiceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Missing injected Supabase service credentials");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function upsertRows(client: SupabaseClient, table: CollectionName, rows: readonly UpsertRow[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await client.from(table).upsert(rows, { onConflict: "webflow_item_id" });
  if (error) throw error;
}

export async function loadExistingRows(client: SupabaseClient, table: CollectionName): Promise<ExistingRow[]> {
  const columns = table === "locations"
    ? "webflow_item_id,webflow_last_updated,name_address,latitude,longitude,geocode_status,geocoded_at"
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
