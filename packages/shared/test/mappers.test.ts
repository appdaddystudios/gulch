import type { Database } from "@gulch/db";
import { describe, expect, it } from "vitest";

import { deriveEventOrganizers, mapEvent, mapLocation, mapOrganizer, mapShow } from "../src/mappers";

type LocationInsert = Database["public"]["Tables"]["locations"]["Insert"];
type EventInsert = Database["public"]["Tables"]["events"]["Insert"];
type OrganizerInsert = Database["public"]["Tables"]["organizers"]["Insert"];
type ShowInsert = Database["public"]["Tables"]["shows"]["Insert"];

const envelope = {
  cmsLocaleId: "locale-123",
  lastPublished: "2026-06-01T12:00:00.000Z",
  createdOn: "2026-05-01T12:00:00.000Z",
  isArchived: false,
  isDraft: false
};

describe("Webflow to Supabase mappers", () => {
  it("maps a full location without setting geocode fields", () => {
    const item = {
      ...envelope,
      id: "location-tim-barrett",
      lastUpdated: "2026-06-02T12:00:00.000Z",
      fieldData: {
        name: "Tim Barrett Designs Inc.",
        slug: "tim-barrett-designs-inc",
        "plain-text-name-address": "Tim Barrett Designs Inc., 10 Krog St NE",
        "google-maps-link-url": "https://maps.google.com/?q=Tim+Barrett+Designs",
        "neighborhood-optional": "Old Fourth Ward",
        "parking-optional": "Street parking",
        "hide-from-locations-list": true,
        "is-organizer": true,
        "managing-organizer": "organizer-atlanta-art-week"
      }
    };

    const mapped: LocationInsert = mapLocation(item);

    expect(mapped).toEqual({
      webflow_item_id: "location-tim-barrett",
      name: "Tim Barrett Designs Inc.",
      slug: "tim-barrett-designs-inc",
      name_address: "Tim Barrett Designs Inc., 10 Krog St NE",
      google_maps_url: "https://maps.google.com/?q=Tim+Barrett+Designs",
      neighborhood: "Old Fourth Ward",
      parking: "Street parking",
      hide_from_list: true,
      is_organizer: true,
      managing_organizer_id: "organizer-atlanta-art-week",
      webflow_last_updated: "2026-06-02T12:00:00.000Z"
    });
    expect("latitude" in mapped).toBe(false);
    expect("longitude" in mapped).toBe(false);
    expect("geocode_status" in mapped).toBe(false);
  });

  it("defaults missing location optionals to null and hide_from_list to false", () => {
    const mapped = mapLocation({
      ...envelope,
      id: "location-minimal",
      lastUpdated: "2026-06-03T12:00:00.000Z",
      fieldData: {
        name: "Minimal Location",
        slug: "minimal-location"
      }
    });

    expect(mapped).toMatchObject({
      name_address: null,
      google_maps_url: null,
      neighborhood: null,
      parking: null,
      hide_from_list: false,
      is_organizer: false,
      managing_organizer_id: null,
      webflow_item_id: "location-minimal",
      webflow_last_updated: "2026-06-03T12:00:00.000Z"
    });
  });

  it("maps whitespace-only location optionals to null", () => {
    const mapped = mapLocation({
      ...envelope,
      id: "location-empty-optional",
      lastUpdated: "2026-06-03T12:00:00.000Z",
      fieldData: {
        name: "Location Empty Optional",
        slug: "location-empty-optional",
        "neighborhood-optional": "   "
      }
    });

    expect(mapped.neighborhood).toBeNull();
  });

  it("maps a full event", () => {
    const item = {
      ...envelope,
      id: "event-makers-market",
      lastUpdated: "2026-06-04T12:00:00.000Z",
      fieldData: {
        name: "Krog District Makers Market",
        slug: "krog-district-makers-market",
        "start-date-time": "2026-07-03T22:00:00.000Z",
        "end-date-time": "2026-07-04T01:00:00.000Z",
        "custom-time-description": "6-9 PM",
        location: "location-tim-barrett",
        "external-link": "https://www.instagram.com/p/example/",
        "show-tickets-required-tag": true,
        "is-editor-s-pick": true
      }
    };

    const mapped: EventInsert = mapEvent(item);

    expect(mapped).toEqual({
      webflow_item_id: "event-makers-market",
      name: "Krog District Makers Market",
      slug: "krog-district-makers-market",
      start_at: "2026-07-03T22:00:00.000Z",
      end_at: "2026-07-04T01:00:00.000Z",
      custom_time_description: "6-9 PM",
      location_id: "location-tim-barrett",
      external_link: "https://www.instagram.com/p/example/",
      tickets_required: true,
      editors_pick: true,
      webflow_last_updated: "2026-06-04T12:00:00.000Z"
    });
  });

  it("maps a full organizer", () => {
    const item = {
      ...envelope,
      id: "organizer-atlanta-art-week",
      lastUpdated: "2026-06-08T12:00:00.000Z",
      fieldData: {
        name: "Atlanta Art Week",
        slug: "atlanta-art-week",
        "website-url": "https://example.com",
        "instagram-url": "https://instagram.com/atlantaartweek",
        "facebook-url": "https://facebook.com/atlantaartweek",
        "is-featured": true,
        "custom-color": "#ffcc00"
      }
    };

    const mapped: OrganizerInsert = mapOrganizer(item);

    expect(mapped).toEqual({
      webflow_item_id: "organizer-atlanta-art-week",
      name: "Atlanta Art Week",
      slug: "atlanta-art-week",
      website_url: "https://example.com",
      instagram_url: "https://instagram.com/atlantaartweek",
      facebook_url: "https://facebook.com/atlantaartweek",
      is_featured: true,
      custom_color: "#ffcc00",
      webflow_last_updated: "2026-06-08T12:00:00.000Z"
    });
  });

  it("maps missing organizer optionals to null and false", () => {
    const mapped = mapOrganizer({
      ...envelope,
      id: "organizer-minimal",
      lastUpdated: "2026-06-09T12:00:00.000Z",
      fieldData: {
        name: "Minimal Organizer",
        slug: "minimal-organizer"
      }
    });

    expect(mapped).toEqual({
      webflow_item_id: "organizer-minimal",
      name: "Minimal Organizer",
      slug: "minimal-organizer",
      website_url: null,
      instagram_url: null,
      facebook_url: null,
      is_featured: false,
      custom_color: null,
      webflow_last_updated: "2026-06-09T12:00:00.000Z"
    });
  });

  it("derives no event organizers from missing, null, or empty references", () => {
    const baseItem = {
      ...envelope,
      id: "event-empty-organizers",
      lastUpdated: "2026-06-10T12:00:00.000Z",
      fieldData: {
        name: "Empty Organizers Event",
        slug: "empty-organizers-event",
        "start-date-time": "2026-07-06T22:00:00.000Z"
      }
    };

    expect(deriveEventOrganizers(baseItem)).toEqual([]);
    expect(
      deriveEventOrganizers({
        ...baseItem,
        fieldData: {
          ...baseItem.fieldData,
          "additional-organizers": null
        }
      })
    ).toEqual([]);
    expect(
      deriveEventOrganizers({
        ...baseItem,
        fieldData: {
          ...baseItem.fieldData,
          "additional-organizers": []
        }
      })
    ).toEqual([]);
  });

  it("derives single, multi, duplicate, and object-shaped event organizer references", () => {
    const item = {
      ...envelope,
      id: "event-with-organizers",
      lastUpdated: "2026-06-11T12:00:00.000Z",
      fieldData: {
        name: "Organized Event",
        slug: "organized-event",
        "start-date-time": "2026-07-07T22:00:00.000Z",
        "additional-organizers": [
          "organizer-one",
          "organizer-two",
          "organizer-one",
          { id: "organizer-three", name: "Passthrough" }
        ]
      }
    };

    expect(deriveEventOrganizers(item)).toEqual([
      { event_id: "event-with-organizers", organizer_id: "organizer-one" },
      { event_id: "event-with-organizers", organizer_id: "organizer-two" },
      { event_id: "event-with-organizers", organizer_id: "organizer-three" }
    ]);
  });

  it("maps missing optional event location, link, and flags to null/defaults", () => {
    const mapped = mapEvent({
      ...envelope,
      id: "event-no-location",
      lastUpdated: "2026-06-05T12:00:00.000Z",
      fieldData: {
        name: "No Location Event",
        slug: "no-location-event",
        "start-date-time": "2026-07-05T22:00:00.000Z"
      }
    });

    expect(mapped).toMatchObject({
      end_at: null,
      custom_time_description: null,
      location_id: null,
      external_link: null,
      tickets_required: false,
      editors_pick: false
    });
  });

  it("maps a full show", () => {
    const item = {
      ...envelope,
      id: "show-studio-visits",
      lastUpdated: "2026-06-06T12:00:00.000Z",
      fieldData: {
        name: "Ongoing Studio Visits",
        slug: "ongoing-studio-visits",
        "start-date": "2026-07-01T00:00:00.000Z",
        "end-date": "2026-07-31T00:00:00.000Z",
        location: "location-tim-barrett",
        "external-link": "https://example.com/show"
      }
    };

    const mapped: ShowInsert = mapShow(item);

    expect(mapped).toEqual({
      webflow_item_id: "show-studio-visits",
      name: "Ongoing Studio Visits",
      slug: "ongoing-studio-visits",
      start_date: "2026-07-01T00:00:00.000Z",
      end_date: "2026-07-31T00:00:00.000Z",
      location_id: "location-tim-barrett",
      external_link: "https://example.com/show",
      webflow_last_updated: "2026-06-06T12:00:00.000Z"
    });
  });

  it("maps a show with no dates to nulls", () => {
    const mapped = mapShow({
      ...envelope,
      id: "show-no-dates",
      lastUpdated: "2026-06-07T12:00:00.000Z",
      fieldData: {
        name: "Show Without Dates",
        slug: "show-without-dates"
      }
    });

    expect(mapped).toMatchObject({
      start_date: null,
      end_date: null,
      location_id: null,
      external_link: null
    });
  });
});
