import {
  parseWebflowItem,
  webflowEventItemSchema,
  webflowLocationItemSchema,
  webflowShowItemSchema
} from "./schemas.ts";

export type LocationRow = {
  webflow_item_id: string;
  name: string;
  slug: string;
  name_address: string | null;
  google_maps_url: string | null;
  neighborhood: string | null;
  parking: string | null;
  hide_from_list: boolean;
  latitude?: number | null;
  longitude?: number | null;
  geocode_status?: "pending" | "ok" | "failed" | "manual";
  geocoded_at?: string | null;
  webflow_last_updated: string;
};

export type EventRow = {
  webflow_item_id: string;
  name: string;
  slug: string;
  start_at: string;
  end_at: string | null;
  custom_time_description: string | null;
  location_id: string | null;
  external_link: string | null;
  tickets_required: boolean;
  webflow_last_updated: string;
};

export type ShowRow = {
  webflow_item_id: string;
  name: string;
  slug: string;
  start_date: string | null;
  end_date: string | null;
  location_id: string | null;
  external_link: string | null;
  webflow_last_updated: string;
};

export type UpsertRow = LocationRow | EventRow | ShowRow;

export function mapLocation(raw: unknown): LocationRow {
  const item = parseWebflowItem(webflowLocationItemSchema, raw);
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
    webflow_last_updated: item.lastUpdated
  };
}

export function mapEvent(raw: unknown): EventRow {
  const item = parseWebflowItem(webflowEventItemSchema, raw);
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
    webflow_last_updated: item.lastUpdated
  };
}

export function mapShow(raw: unknown): ShowRow {
  const item = parseWebflowItem(webflowShowItemSchema, raw);
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

