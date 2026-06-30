import type { DbClient } from "@gulch/db";
import { z } from "zod";

export type FeaturedOrganizer = {
  readonly id: string;
  readonly name: string;
  readonly customColor: string | null;
  readonly instagramUrl: string | null;
};

export const ORGANIZER_SELECT =
  "webflow_item_id, name, custom_color, instagram_url";

const rawOrganizerSchema = z.object({
  webflow_item_id: z.string(),
  name: z.string(),
  custom_color: z.string().nullable(),
  instagram_url: z.string().nullable(),
});

type RawOrganizer = z.infer<typeof rawOrganizerSchema>;

export const toFeaturedOrganizer = (raw: RawOrganizer): FeaturedOrganizer => ({
  id: raw.webflow_item_id,
  name: raw.name,
  customColor: raw.custom_color,
  instagramUrl: raw.instagram_url,
});

type ListFeaturedOptions = {
  readonly limit?: number;
};

// Organizers flagged is_featured, alphabetical.
export const listFeaturedOrganizers = async (
  client: DbClient,
  { limit = 10 }: ListFeaturedOptions = {},
): Promise<readonly FeaturedOrganizer[]> => {
  const { data, error } = await client
    .from("organizers")
    .select(ORGANIZER_SELECT)
    .eq("is_featured", true)
    .order("name", { ascending: true })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => toFeaturedOrganizer(rawOrganizerSchema.parse(row)));
};
