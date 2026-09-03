import type { EventListItem } from "./events";

// Anything that can answer "do you already know this id?" — a Map of rows or
// a Set of ids in flight / already fetched.
export type IdIndex = { readonly has: (id: string) => boolean };

export type EventMap = ReadonlyMap<string, EventListItem>;

export type PickOrder = "soonest" | "given";

export type PickOptions = {
  readonly order: PickOrder;
  readonly limit: number;
};

// Ids in `wanted` that none of the `known` indexes hold, deduped, in the
// order first seen.
export const missingIds = (
  wanted: readonly string[],
  ...known: readonly IdIndex[]
): readonly string[] =>
  [...new Set(wanted)].filter((id) => !known.some((index) => index.has(id)));

// `base` wins on overlap — it comes from the fresher page query.
export const mergeById = (base: EventMap, extra: EventMap): EventMap =>
  new Map([...extra, ...base]);

const byStartAt = (a: EventListItem, b: EventListItem): number =>
  a.startAt < b.startAt ? -1 : a.startAt > b.startAt ? 1 : 0;

// Resolves `ids` against `byId`, skipping unknown ones, then orders and caps
// the result for a carousel.
export const pickEvents = (
  ids: readonly string[],
  byId: EventMap,
  { order, limit }: PickOptions,
): readonly EventListItem[] => {
  if (limit <= 0) {
    return [];
  }
  const found = [...new Set(ids)].flatMap((id) => {
    const event = byId.get(id);
    return event ? [event] : [];
  });
  const ordered = order === "soonest" ? [...found].sort(byStartAt) : found;
  return ordered.slice(0, limit);
};
