import type { DbClient } from "@gulch/db";

export type SponsorableEvent = {
  readonly id: string;
  readonly name: string;
  readonly startAt: string;
  readonly sponsored: boolean;
};

// Upcoming events only — sponsorship is sold against future dates, and a
// bounded list keeps the card scannable.
export const getSponsorableEvents = async (
  client: DbClient
): Promise<readonly SponsorableEvent[]> => {
  const { data, error } = await client
    .from("events")
    .select("webflow_item_id, name, start_at, sponsored")
    .gte("start_at", new Date().toISOString())
    .order("start_at", { ascending: true })
    .limit(50);

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    id: row.webflow_item_id,
    name: row.name,
    startAt: row.start_at,
    sponsored: row.sponsored
  }));
};

export const setEventSponsored = async (
  client: DbClient,
  id: string,
  sponsored: boolean
): Promise<void> => {
  const { error } = await client
    .from("events")
    .update({ sponsored })
    .eq("webflow_item_id", id);

  if (error) {
    throw error;
  }
};
