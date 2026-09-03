import type { DbClient } from "@gulch/db";
import { z } from "zod";

import { formatWeekRange, weekStartKey } from "./format";

export type EventImageStatus = "pending" | "ok" | "failed" | "unavailable";

export type EventListItem = {
  readonly id: string;
  readonly name: string;
  readonly startAt: string;
  readonly endAt: string | null;
  // Free-text time override (e.g. "Doors at 6, show at 7"); preferred over the
  // formatted start/end whenever present, on cards and the detail page alike.
  readonly customTimeDescription: string | null;
  readonly imageUrl: string | null;
  readonly imageStatus: EventImageStatus;
  readonly ticketsRequired: boolean;
  readonly editorsPick: boolean;
  readonly sponsored: boolean;
  // Aggregate anonymous saves (event_save_counts); 0 when the row is absent.
  readonly saveCount: number;
  // Linked Instagram post is a video (reel) — the details hero offers playback.
  readonly isVideo: boolean;
  readonly externalLink: string | null;
  readonly organizerName: string | null;
  readonly locationName: string | null;
  // Venue coordinates when geocoded; both null otherwise ("open in maps"
  // falls back to a name search).
  readonly latitude: number | null;
  readonly longitude: number | null;
};

export type EventDetail = EventListItem;

// PostgREST select used by every events query in the app.
const EVENT_FIELDS =
  "webflow_item_id, name, start_at, end_at, custom_time_description, image_url, image_status, tickets_required, editors_pick, sponsored, is_video, external_link, locations(name, latitude, longitude), event_organizers(organizers(name))";

export const EVENT_SELECT = `${EVENT_FIELDS}, event_save_counts(saves)`;

const namedSchema = z.object({ name: z.string() });

// Embedded relations come back as an object (to-one) or array depending on the
// PostgREST shape; accept either and read the first available name.
const embeddedNameSchema = z
  .union([namedSchema, z.array(namedSchema)])
  .nullable()
  .optional();

const locationSchema = z.object({
  name: z.string(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
});

const embeddedLocationSchema = z
  .union([locationSchema, z.array(locationSchema)])
  .nullable()
  .optional();

export const rawEventSchema = z.object({
  webflow_item_id: z.string(),
  name: z.string(),
  start_at: z.string(),
  end_at: z.string().nullable(),
  image_url: z.string().nullable(),
  custom_time_description: z.string().nullable().optional(),
  image_status: z.enum(["pending", "ok", "failed", "unavailable"]),
  tickets_required: z.boolean(),
  // Older rows (pre-migration) may omit the column; default to false.
  editors_pick: z.boolean().optional().default(false),
  sponsored: z.boolean().optional().default(false),
  is_video: z.boolean().optional().default(false),
  external_link: z.string().nullable(),
  locations: embeddedLocationSchema,
  // To-one embed; PostgREST may still return an array shape.
  event_save_counts: z
    .union([
      z.object({ saves: z.number() }),
      z.array(z.object({ saves: z.number() })),
    ])
    .nullable()
    .optional(),
  event_organizers: z
    .array(z.object({ organizers: embeddedNameSchema }))
    .nullable()
    .optional(),
});

type RawEvent = z.infer<typeof rawEventSchema>;
type EmbeddedName = z.infer<typeof embeddedNameSchema>;
type EmbeddedLocation = z.infer<typeof embeddedLocationSchema>;
type RawLocation = z.infer<typeof locationSchema>;

const firstName = (value: EmbeddedName): string | null => {
  if (!value) {
    return null;
  }
  const record = Array.isArray(value) ? value[0] : value;
  return record?.name ?? null;
};

const firstLocation = (value: EmbeddedLocation): RawLocation | null => {
  if (!value) {
    return null;
  }
  return (Array.isArray(value) ? value[0] : value) ?? null;
};

const organizerName = (rows: RawEvent["event_organizers"]): string | null => {
  for (const row of rows ?? []) {
    const name = firstName(row.organizers);
    if (name) {
      return name;
    }
  }
  return null;
};

const saveCount = (value: RawEvent["event_save_counts"]): number => {
  if (!value) {
    return 0;
  }
  const record = Array.isArray(value) ? value[0] : value;
  return record?.saves ?? 0;
};

export const toEventListItem = (raw: RawEvent): EventListItem => {
  const location = firstLocation(raw.locations);
  return {
    id: raw.webflow_item_id,
  name: raw.name,
  startAt: raw.start_at,
  endAt: raw.end_at,
  customTimeDescription: raw.custom_time_description ?? null,
  imageUrl: raw.image_url,
  imageStatus: raw.image_status,
  ticketsRequired: raw.tickets_required,
  editorsPick: raw.editors_pick,
  sponsored: raw.sponsored,
  saveCount: saveCount(raw.event_save_counts),
  isVideo: raw.is_video,
  externalLink: raw.external_link,
    organizerName: organizerName(raw.event_organizers),
    locationName: location?.name ?? null,
    latitude: location?.latitude ?? null,
    longitude: location?.longitude ?? null,
  };
};

type ListUpcomingOptions = {
  readonly limit?: number;
  readonly nowIso?: string;
};

// Events starting now or later, soonest first.
export const listUpcomingEvents = async (
  client: DbClient,
  { limit = 20, nowIso }: ListUpcomingOptions = {},
): Promise<readonly EventListItem[]> => {
  const startBoundary = nowIso ?? new Date().toISOString();

  const { data, error } = await client
    .from("events")
    .select(EVENT_SELECT)
    .gte("start_at", startBoundary)
    .order("start_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => toEventListItem(rawEventSchema.parse(row)));
};

type ListDeckOptions = {
  readonly limit?: number;
  readonly nowIso?: string;
  /** Ids the deck will drop, so the fetch reaches past them. */
  readonly excludeCount?: number;
};

// Ceiling on the over-fetch below. A user with more saved events than this
// among the soonest ones gets a shorter deck rather than an unbounded query.
export const DECK_FETCH_MAX = 100;

// Home swipe deck: upcoming events that have a usable hero image (R7),
// soonest first. The deck reducer drops already-saved ids AFTER this query,
// so the row limit has to reach past them — otherwise a returning user who
// saved the soonest events gets a short (or empty) deck while later unsaved
// events exist.
export const listDeckEvents = async (
  client: DbClient,
  { limit = 20, nowIso, excludeCount = 0 }: ListDeckOptions = {},
): Promise<readonly EventListItem[]> => {
  const startBoundary = nowIso ?? new Date().toISOString();
  const fetchLimit = Math.min(limit + excludeCount, DECK_FETCH_MAX);

  const { data, error } = await client
    .from("events")
    .select(EVENT_SELECT)
    .gte("start_at", startBoundary)
    .eq("image_status", "ok")
    .not("image_url", "is", null)
    .order("start_at", { ascending: true })
    .limit(fetchLimit);

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => toEventListItem(rawEventSchema.parse(row)));
};

const rawTrendingRowSchema = z.object({
  saves: z.number(),
  events: rawEventSchema,
});

type ListTrendingOptions = {
  readonly limit?: number;
  readonly nowIso?: string;
};

// Most-saved upcoming events, ranked server-side across ALL upcoming events
// (not just the soonest page) via the event_save_counts counter table.
export const listTrendingEvents = async (
  client: DbClient,
  { limit = 6, nowIso }: ListTrendingOptions = {},
): Promise<readonly EventListItem[]> => {
  const startBoundary = nowIso ?? new Date().toISOString();

  const { data, error } = await client
    .from("event_save_counts")
    .select(`saves, events!inner(${EVENT_FIELDS})`)
    .gt("saves", 0)
    .gte("events.start_at", startBoundary)
    .order("saves", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => {
    const parsed = rawTrendingRowSchema.parse(row);
    return { ...toEventListItem(parsed.events), saveCount: parsed.saves };
  });
};

// Events matching a set of ids (for the saved/lineup list), soonest first.
export const listEventsByIds = async (
  client: DbClient,
  ids: readonly string[],
): Promise<readonly EventListItem[]> => {
  if (ids.length === 0) {
    return [];
  }

  const { data, error } = await client
    .from("events")
    .select(EVENT_SELECT)
    .in("webflow_item_id", ids as string[])
    .order("start_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => toEventListItem(rawEventSchema.parse(row)));
};

export type EventWeekSection = {
  readonly key: string;
  readonly title: string;
  readonly data: readonly EventListItem[];
};

// Buckets events into week sections (Sunday-start), oldest week first.
// Assumes `events` is already ordered by start time (as listUpcomingEvents returns).
export const groupEventsByWeek = (
  events: readonly EventListItem[],
  timeZone?: string,
): readonly EventWeekSection[] => {
  const buckets = new Map<string, EventListItem[]>();

  for (const event of events) {
    const key = weekStartKey(event.startAt, timeZone);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(event);
    } else {
      buckets.set(key, [event]);
    }
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, data]) => ({ key, title: formatWeekRange(key), data }));
};

// Single event by its Webflow item id (null when not found).
export const getEventDetail = async (
  client: DbClient,
  id: string,
): Promise<EventDetail | null> => {
  const { data, error } = await client
    .from("events")
    .select(EVENT_SELECT)
    .eq("webflow_item_id", id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? toEventListItem(rawEventSchema.parse(data)) : null;
};
