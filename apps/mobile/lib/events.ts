import type { DbClient } from "@gulch/db";
import { z } from "zod";

import { formatWeekRange, weekStartKey } from "./format";

export type EventImageStatus = "pending" | "ok" | "failed" | "unavailable";

export type EventListItem = {
  readonly id: string;
  readonly name: string;
  readonly startAt: string;
  readonly endAt: string | null;
  readonly imageUrl: string | null;
  readonly imageStatus: EventImageStatus;
  readonly ticketsRequired: boolean;
  readonly externalLink: string | null;
  readonly organizerName: string | null;
  readonly locationName: string | null;
};

export type EventDetail = EventListItem & {
  readonly customTimeDescription: string | null;
};

// PostgREST select used by every events query in the app.
export const EVENT_SELECT =
  "webflow_item_id, name, start_at, end_at, image_url, image_status, tickets_required, external_link, locations(name), event_organizers(organizers(name))";

// Detail view also needs the free-text time override.
export const EVENT_DETAIL_SELECT = `${EVENT_SELECT}, custom_time_description`;

const namedSchema = z.object({ name: z.string() });

// Embedded relations come back as an object (to-one) or array depending on the
// PostgREST shape; accept either and read the first available name.
const embeddedNameSchema = z
  .union([namedSchema, z.array(namedSchema)])
  .nullable()
  .optional();

const rawEventSchema = z.object({
  webflow_item_id: z.string(),
  name: z.string(),
  start_at: z.string(),
  end_at: z.string().nullable(),
  image_url: z.string().nullable(),
  image_status: z.enum(["pending", "ok", "failed", "unavailable"]),
  tickets_required: z.boolean(),
  external_link: z.string().nullable(),
  locations: embeddedNameSchema,
  event_organizers: z
    .array(z.object({ organizers: embeddedNameSchema }))
    .nullable()
    .optional(),
});

type RawEvent = z.infer<typeof rawEventSchema>;
type EmbeddedName = z.infer<typeof embeddedNameSchema>;

const firstName = (value: EmbeddedName): string | null => {
  if (!value) {
    return null;
  }
  const record = Array.isArray(value) ? value[0] : value;
  return record?.name ?? null;
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

export const toEventListItem = (raw: RawEvent): EventListItem => ({
  id: raw.webflow_item_id,
  name: raw.name,
  startAt: raw.start_at,
  endAt: raw.end_at,
  imageUrl: raw.image_url,
  imageStatus: raw.image_status,
  ticketsRequired: raw.tickets_required,
  externalLink: raw.external_link,
  organizerName: organizerName(raw.event_organizers),
  locationName: firstName(raw.locations),
});

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

const rawEventDetailSchema = rawEventSchema.extend({
  custom_time_description: z.string().nullable(),
});

type RawEventDetail = z.infer<typeof rawEventDetailSchema>;

export const toEventDetail = (raw: RawEventDetail): EventDetail => ({
  ...toEventListItem(raw),
  customTimeDescription: raw.custom_time_description,
});

// Single event by its Webflow item id (null when not found).
export const getEventDetail = async (
  client: DbClient,
  id: string,
): Promise<EventDetail | null> => {
  const { data, error } = await client
    .from("events")
    .select(EVENT_DETAIL_SELECT)
    .eq("webflow_item_id", id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? toEventDetail(rawEventDetailSchema.parse(data)) : null;
};
