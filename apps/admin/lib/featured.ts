import type { DbClient } from "@gulch/db";

// Admin curation for featured_organizers. Edits happen on an ordered id list
// (pure helpers below), then the whole curation is rewritten in one pass.

export type OrganizerRow = {
  readonly id: string;
  readonly name: string;
};

export type FeaturedState = {
  readonly organizers: readonly OrganizerRow[];
  readonly featuredIds: readonly string[];
};

export type FeaturedClient = Pick<DbClient, "from">;

export const addToList = (list: readonly string[], id: string): readonly string[] =>
  list.includes(id) ? list : [...list, id];

export const removeFromList = (list: readonly string[], id: string): readonly string[] =>
  list.filter((item) => item !== id);

export const moveInList = (
  list: readonly string[],
  id: string,
  direction: "up" | "down"
): readonly string[] => {
  const index = list.indexOf(id);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || target < 0 || target >= list.length) {
    return list;
  }
  const current = list[index];
  const neighbor = list[target];
  if (current === undefined || neighbor === undefined) {
    return list;
  }
  const next = [...list];
  next[index] = neighbor;
  next[target] = current;
  return next;
};

type QueryResult<T> = {
  readonly data: readonly T[] | null;
  readonly error: { readonly message: string } | null;
};

type RawOrganizer = { readonly webflow_item_id: string; readonly name: string };
type RawFeatured = { readonly organizer_id: string; readonly position: number };

export const getFeaturedState = async (client: FeaturedClient): Promise<FeaturedState> => {
  const [organizers, featured] = await Promise.all([
    client
      .from("organizers")
      .select("webflow_item_id, name")
      .order("name", { ascending: true }) as PromiseLike<QueryResult<RawOrganizer>>,
    client
      .from("featured_organizers")
      .select("organizer_id, position")
      .order("position", { ascending: true }) as PromiseLike<QueryResult<RawFeatured>>
  ]);

  if (organizers.error) {
    throw new Error(`Failed to load organizers: ${organizers.error.message}`);
  }
  if (featured.error) {
    throw new Error(`Failed to load featured organizers: ${featured.error.message}`);
  }

  return {
    organizers: (organizers.data ?? []).map((raw) => ({ id: raw.webflow_item_id, name: raw.name })),
    featuredIds: (featured.data ?? []).map((raw) => raw.organizer_id)
  };
};

type WriteResult = { readonly error: { readonly message: string } | null };

// Rewrites the curation to exactly orderedIds (positions 0..n-1). Delete-then-
// insert keeps it simple: the table is tiny, admin-only, and the mobile app
// degrades gracefully to its empty state during the brief write window.
export const setFeaturedOrganizers = async (
  client: FeaturedClient,
  orderedIds: readonly string[]
): Promise<void> => {
  // PostgREST requires a filter on delete; position >= -1 matches every row.
  const deleted = await (client
    .from("featured_organizers")
    .delete()
    .gte("position", -1) as unknown as PromiseLike<WriteResult>);

  if (deleted.error) {
    throw new Error(`Failed to update featured organizers: ${deleted.error.message}`);
  }
  if (orderedIds.length === 0) {
    return;
  }

  const rows = orderedIds.map((organizer_id, position) => ({ organizer_id, position }));
  const inserted = await (client
    .from("featured_organizers")
    .insert(rows) as unknown as PromiseLike<WriteResult>);

  if (inserted.error) {
    throw new Error(`Failed to update featured organizers: ${inserted.error.message}`);
  }
};
