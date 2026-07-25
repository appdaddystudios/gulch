import type { DbClient } from "@gulch/db";
import { z } from "zod";

import {
  rawEventSchema,
  toEventListItem,
  type EventListItem,
} from "./events";

export type MapVenue = {
  readonly id: string;
  readonly name: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly events: readonly EventListItem[];
};

// Same event columns as EVENT_SELECT, with the locations embed widened to
// carry the id + coordinates the map pins need.
export const MAP_EVENT_SELECT =
  "webflow_item_id, name, start_at, end_at, custom_time_description, image_url, image_status, tickets_required, editors_pick, external_link, locations(webflow_item_id, name, latitude, longitude), event_organizers(organizers(name))";

const rawLocationSchema = z.object({
  webflow_item_id: z.string(),
  name: z.string(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
});

// PostgREST returns to-one embeds as an object or a single-element array.
const embeddedLocationSchema = z
  .union([rawLocationSchema, z.array(rawLocationSchema)])
  .nullable()
  .optional();

const rawMapEventSchema = rawEventSchema.extend({
  locations: embeddedLocationSchema,
});

type RawLocation = z.infer<typeof rawLocationSchema>;
type EmbeddedLocation = z.infer<typeof embeddedLocationSchema>;

const firstLocation = (value: EmbeddedLocation): RawLocation | null => {
  if (!value) {
    return null;
  }
  return (Array.isArray(value) ? value[0] : value) ?? null;
};

type PinnableLocation = RawLocation & {
  readonly latitude: number;
  readonly longitude: number;
};

const hasCoordinates = (
  location: RawLocation | null,
): location is PinnableLocation =>
  location !== null &&
  location.latitude !== null &&
  location.longitude !== null;

type ListMapVenuesOptions = {
  readonly nowIso?: string;
};

// Page size for the range() loop below; also bounded by Supabase's max_rows.
export const MAP_EVENT_PAGE_SIZE = 250;

// Upcoming events grouped into one pin per venue. Events whose venue is
// missing or not yet geocoded are skipped — they cannot be placed on the map.
// Venue order follows each venue's earliest upcoming event. Pages through the
// full upcoming set (no silent cap): a fixed limit would drop later events
// and omit or undercount venues once the calendar outgrows it.
export const listMapVenues = async (
  client: DbClient,
  { nowIso }: ListMapVenuesOptions = {},
): Promise<readonly MapVenue[]> => {
  const startBoundary = nowIso ?? new Date().toISOString();
  const venues = new Map<string, MapVenue & { events: EventListItem[] }>();

  for (let from = 0; ; from += MAP_EVENT_PAGE_SIZE) {
    const { data, error } = await client
      .from("events")
      .select(MAP_EVENT_SELECT)
      .gte("start_at", startBoundary)
      .order("start_at", { ascending: true })
      // Tie-break on the primary key so pagination is stable when many
      // events share a start time.
      .order("webflow_item_id", { ascending: true })
      .range(from, from + MAP_EVENT_PAGE_SIZE - 1);

    if (error) {
      throw error;
    }

    const page = data ?? [];
    for (const row of page) {
      const raw = rawMapEventSchema.parse(row);
      const location = firstLocation(raw.locations);
      if (!hasCoordinates(location)) {
        continue;
      }

      const event = toEventListItem(raw);
      const existing = venues.get(location.webflow_item_id);
      if (existing) {
        existing.events.push(event);
      } else {
        venues.set(location.webflow_item_id, {
          id: location.webflow_item_id,
          name: location.name,
          latitude: location.latitude,
          longitude: location.longitude,
          events: [event],
        });
      }
    }

    if (page.length < MAP_EVENT_PAGE_SIZE) {
      return [...venues.values()];
    }
  }
};
