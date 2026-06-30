import type { Database } from "@gulch/db";

import {
  parseWebflowItem,
  webflowEventItemSchema,
  webflowLocationItemSchema,
  webflowOrganizerItemSchema,
  webflowShowItemSchema
} from "./webflow-schemas";

export type LocationInsert = Database["public"]["Tables"]["locations"]["Insert"];
export type EventInsert = Database["public"]["Tables"]["events"]["Insert"];
export type OrganizerInsert = Database["public"]["Tables"]["organizers"]["Insert"];
export type EventOrganizerInsert = Database["public"]["Tables"]["event_organizers"]["Insert"];
export type ShowInsert = Database["public"]["Tables"]["shows"]["Insert"];

export function mapLocation(raw: unknown): LocationInsert {
  const item = parseWebflowItem(webflowLocationItemSchema, raw).data;
  const fields = item.fieldData;

  return {
    webflow_item_id: item.id,
    name: fields.name,
    slug: fields.slug,
    name_address: fields["plain-text-name-address"] ?? null,
    google_maps_url: fields["google-maps-link-url"] ?? null,
    neighborhood: fields["neighborhood-optional"] ?? null,
    parking: fields["parking-optional"] ?? null,
    hide_from_list: fields["hide-from-locations-list"] ?? false,
    is_organizer: fields["is-organizer"] ?? false,
    managing_organizer_id: fields["managing-organizer"] ?? null,
    webflow_last_updated: item.lastUpdated
  };
}

export function mapEvent(raw: unknown): EventInsert {
  const item = parseWebflowItem(webflowEventItemSchema, raw).data;
  const fields = item.fieldData;

  return {
    webflow_item_id: item.id,
    name: fields.name,
    slug: fields.slug,
    start_at: fields["start-date-time"],
    end_at: fields["end-date-time"] ?? null,
    custom_time_description: fields["custom-time-description"] ?? null,
    location_id: fields.location ?? null,
    external_link: fields["external-link"] ?? null,
    tickets_required: fields["show-tickets-required-tag"] ?? false,
    editors_pick: fields["is-editor-s-pick"] ?? false,
    webflow_last_updated: item.lastUpdated
  };
}

export function mapOrganizer(raw: unknown): OrganizerInsert {
  const item = parseWebflowItem(webflowOrganizerItemSchema, raw).data;
  const fields = item.fieldData;

  return {
    webflow_item_id: item.id,
    name: fields.name,
    slug: fields.slug,
    website_url: fields["website-url"] ?? null,
    instagram_url: fields["instagram-url"] ?? null,
    facebook_url: fields["facebook-url"] ?? null,
    is_featured: fields["is-featured"] ?? false,
    custom_color: fields["custom-color"] ?? null,
    webflow_last_updated: item.lastUpdated
  };
}

export function deriveEventOrganizers(raw: unknown): EventOrganizerInsert[] {
  const item = parseWebflowItem(webflowEventItemSchema, raw).data;
  const seen = new Set<string>();

  return item.fieldData["additional-organizers"].flatMap((organizerId) => {
    if (seen.has(organizerId)) {
      return [];
    }

    seen.add(organizerId);
    return [{ event_id: item.id, organizer_id: organizerId }];
  });
}

export function mapShow(raw: unknown): ShowInsert {
  const item = parseWebflowItem(webflowShowItemSchema, raw).data;
  const fields = item.fieldData;

  return {
    webflow_item_id: item.id,
    name: fields.name,
    slug: fields.slug,
    start_date: fields["start-date"] ?? null,
    end_date: fields["end-date"] ?? null,
    location_id: fields.location ?? null,
    external_link: fields["external-link"] ?? null,
    webflow_last_updated: item.lastUpdated
  };
}
