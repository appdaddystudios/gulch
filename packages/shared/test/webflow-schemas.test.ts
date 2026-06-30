import { describe, expect, it } from "vitest";

import {
  mapEvent,
  mapLocation,
  mapShow,
  parseWebflowItem,
  webflowEventItemSchema,
  webflowLocationItemSchema,
  webflowShowItemSchema
} from "../src";

const envelope = {
  id: "item-123",
  cmsLocaleId: "locale-123",
  lastPublished: "2026-06-01T12:00:00.000Z",
  lastUpdated: "2026-06-02T12:00:00.000Z",
  createdOn: "2026-05-01T12:00:00.000Z",
  isArchived: false,
  isDraft: false,
  extraEnvelopeKey: "allowed"
};

describe("Webflow item schemas", () => {
  it("parses valid items and preserves passthrough envelope fields", () => {
    const location = parseWebflowItem(webflowLocationItemSchema, {
      ...envelope,
      fieldData: {
        name: "Tim Barrett Designs Inc.",
        slug: "tim-barrett-designs-inc",
        "plain-text-name-address": "Tim Barrett Designs Inc., 10 Krog St NE",
        "google-maps-link-url": "https://maps.google.com/?q=Tim+Barrett+Designs",
        "neighborhood-optional": "Old Fourth Ward",
        "parking-optional": "Street parking",
        "hide-from-locations-list": false
      }
    });

    expect(location.success).toBe(true);
    expect(location.data.extraEnvelopeKey).toBe("allowed");

    const event = parseWebflowItem(webflowEventItemSchema, {
      ...envelope,
      fieldData: {
        name: "Krog District Makers Market",
        slug: "krog-district-makers-market",
        "start-date-time": "2026-07-03T22:00:00.000Z",
        "end-date-time": "2026-07-04T01:00:00.000Z",
        "custom-time-description": "6-9 PM",
        location: "location-123",
        "external-link": "https://www.instagram.com/p/example/",
        "show-tickets-required-tag": true
      }
    });

    expect(event.data.fieldData["external-link"]).toBe("https://www.instagram.com/p/example/");

    const show = parseWebflowItem(webflowShowItemSchema, {
      ...envelope,
      fieldData: {
        name: "Ongoing Studio Visits",
        slug: "ongoing-studio-visits",
        "start-date": "2026-07-01T00:00:00.000Z",
        "end-date": "2026-07-31T00:00:00.000Z",
        location: "location-123",
        "external-link": null
      }
    });

    expect(show.data.fieldData["external-link"]).toBeNull();
  });

  it("allows optional fieldData keys to be missing", () => {
    const parsed = parseWebflowItem(webflowLocationItemSchema, {
      ...envelope,
      fieldData: {
        name: "Minimal Location",
        slug: "minimal-location"
      }
    });

    expect(parsed.data.fieldData.name).toBe("Minimal Location");
  });

  it("rejects missing required fields with clear paths", () => {
    expect(() =>
      parseWebflowItem(webflowLocationItemSchema, {
        ...envelope,
        fieldData: {
          slug: "missing-name"
        }
      })
    ).toThrow(/fieldData\.name: Required/);

    expect(() =>
      parseWebflowItem(webflowLocationItemSchema, {
        ...envelope,
        fieldData: {
          name: "Missing Slug"
        }
      })
    ).toThrow(/fieldData\.slug: Required/);

    expect(() =>
      parseWebflowItem(webflowEventItemSchema, {
        ...envelope,
        fieldData: {
          name: "Missing Start",
          slug: "missing-start",
          "external-link": "https://example.com"
        }
      })
    ).toThrow(/fieldData\.start-date-time: Required/);

    const missingLinkEvent = parseWebflowItem(webflowEventItemSchema, {
      ...envelope,
      fieldData: {
        name: "Missing Link",
        slug: "missing-link",
        "start-date-time": "2026-07-03T22:00:00.000Z"
      }
    });

    expect(missingLinkEvent.data.fieldData["external-link"]).toBeNull();
  });

  it("rejects empty required strings", () => {
    expect(() =>
      parseWebflowItem(webflowEventItemSchema, {
        ...envelope,
        fieldData: {
          name: "Empty Link",
          slug: "empty-link",
          "start-date-time": "",
          "external-link": ""
        }
      })
    ).toThrow(/Required string cannot be empty/);
  });

  it("allows event external-link to be null and maps it to null", () => {
    const parsed = parseWebflowItem(webflowEventItemSchema, {
      ...envelope,
      fieldData: {
        name: "No Link Event",
        slug: "no-link-event",
        "start-date-time": "2026-07-03T22:00:00.000Z",
        "external-link": null
      }
    });

    expect(parsed.data.fieldData["external-link"]).toBeNull();
    expect(mapEvent(parsed.data).external_link).toBeNull();
  });

  it("normalizes empty optional event external-link to null", () => {
    const parsed = parseWebflowItem(webflowEventItemSchema, {
      ...envelope,
      fieldData: {
        name: "Empty Link Event",
        slug: "empty-link-event",
        "start-date-time": "2026-07-03T22:00:00.000Z",
        "external-link": ""
      }
    });

    expect(parsed.data.fieldData["external-link"]).toBeNull();
    expect(mapEvent(parsed.data).external_link).toBeNull();
  });

  it("accepts and strips unknown fieldData keys while preserving mapped fields", () => {
    const item = {
      ...envelope,
      id: "location-extra-field",
      fieldData: {
        name: "Extra Field Location",
        slug: "extra-field-location",
        "plain-text-name-address": "Extra Field Location, 10 Krog St NE",
        "some-new-webflow-field": "x"
      }
    };

    const parsed = parseWebflowItem(webflowLocationItemSchema, item);

    expect(parsed.data.fieldData.name).toBe("Extra Field Location");
    expect(parsed.data.fieldData.slug).toBe("extra-field-location");
    expect("some-new-webflow-field" in parsed.data.fieldData).toBe(false);
    expect(mapLocation(item)).toMatchObject({
      webflow_item_id: "location-extra-field",
      name: "Extra Field Location",
      slug: "extra-field-location",
      name_address: "Extra Field Location, 10 Krog St NE"
    });
  });

  it("formats root-level boundary errors clearly", () => {
    expect(() => parseWebflowItem(webflowLocationItemSchema, null)).toThrow(/<root>: Expected object/);
  });

  it("exports mappers from the public entry point", () => {
    expect(mapLocation).toBeTypeOf("function");
    expect(mapEvent).toBeTypeOf("function");
    expect(mapShow).toBeTypeOf("function");
  });
});
