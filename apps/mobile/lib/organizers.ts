import type { DbClient } from "@gulch/db";
import { z } from "zod";

export type FeaturedOrganizer = {
  readonly id: string;
  readonly name: string;
  readonly customColor: string | null;
  readonly instagramUrl: string | null;
};

// Featured comes from the admin-curated featured_organizers table (NOT the
// Webflow-synced organizers.is_featured flag — the sync clobbers direct edits).
export const FEATURED_SELECT =
  "position, organizers(webflow_item_id, name, custom_color, instagram_url)";

const rawOrganizerSchema = z.object({
  webflow_item_id: z.string(),
  name: z.string(),
  custom_color: z.string().nullable(),
  instagram_url: z.string().nullable(),
});

// Embedded to-one relations come back as an object or single-element array
// depending on the PostgREST shape; accept either.
const rawFeaturedSchema = z.object({
  position: z.number(),
  organizers: z
    .union([rawOrganizerSchema, z.array(rawOrganizerSchema)])
    .nullable(),
});

type RawOrganizer = z.infer<typeof rawOrganizerSchema>;
type RawFeatured = z.infer<typeof rawFeaturedSchema>;

const embeddedOrganizer = (
  value: RawFeatured["organizers"],
): RawOrganizer | null => {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? (value[0] ?? null) : value;
};

export const toFeaturedOrganizer = (raw: RawOrganizer): FeaturedOrganizer => ({
  id: raw.webflow_item_id,
  name: raw.name,
  customColor: raw.custom_color,
  instagramUrl: raw.instagram_url,
});

type ListFeaturedOptions = {
  readonly limit?: number;
};

// Admin-curated featured organizers, in curated order.
export const listFeaturedOrganizers = async (
  client: DbClient,
  { limit = 10 }: ListFeaturedOptions = {},
): Promise<readonly FeaturedOrganizer[]> => {
  const { data, error } = await client
    .from("featured_organizers")
    .select(FEATURED_SELECT)
    .order("position", { ascending: true })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data ?? [])
    .map((row) => embeddedOrganizer(rawFeaturedSchema.parse(row).organizers))
    .filter((organizer): organizer is RawOrganizer => organizer !== null)
    .map(toFeaturedOrganizer);
};
