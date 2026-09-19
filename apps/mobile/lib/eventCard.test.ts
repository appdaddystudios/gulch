import { describe, expect, it } from "vitest";

import {
  EVENT_CARD_BORDER,
  EVENT_CARD_PANEL_HEIGHT,
  eventCardHeight,
  eventCardLabel,
  eventHeroHeight,
  eventMetaLabel,
  eventTimeLabel,
} from "./eventCard";
import type { EventListItem } from "./events";

const event = (overrides: Partial<EventListItem> = {}): EventListItem => ({
  id: "e1",
  name: "Opening Night",
  startAt: "2026-09-19T17:00:00-04:00",
  endAt: "2026-09-19T19:00:00-04:00",
  customTimeDescription: null,
  imageUrl: null,
  imageStatus: "ok",
  ticketsRequired: false,
  editorsPick: false,
  sponsored: false,
  saveCount: 0,
  isVideo: false,
  externalLink: null,
  organizerName: null,
  locationName: "Whitespace Gallery",
  latitude: null,
  longitude: null,
  ...overrides,
});

describe("eventHeroHeight / eventCardHeight", () => {
  it("derives a 4:3 hero from the width inside the border", () => {
    expect(eventHeroHeight(370)).toBe(Math.round((370 - 4) * 0.75));
    expect(eventHeroHeight(311)).toBe(Math.round((311 - 4) * 0.75));
  });

  it("adds the fixed panel and both borders to the hero", () => {
    expect(eventCardHeight(370)).toBe(
      eventHeroHeight(370) + EVENT_CARD_PANEL_HEIGHT + 2 * EVENT_CARD_BORDER,
    );
    expect(EVENT_CARD_PANEL_HEIGHT).toBe(158);
  });
});

describe("eventMetaLabel", () => {
  it("prefers the organizer and falls back to the venue", () => {
    expect(eventMetaLabel(event({ organizerName: "GULCH" }))).toBe("GULCH");
    expect(eventMetaLabel(event())).toBe("Whitespace Gallery");
    expect(eventMetaLabel(event({ locationName: null }))).toBeNull();
  });
});

describe("eventTimeLabel", () => {
  it("formats the compact start/end and honours a custom description", () => {
    expect(eventTimeLabel(event())).toMatch(/Sat Sep 19/);
    expect(eventTimeLabel(event({ customTimeDescription: "Doors at 6" }))).toContain(
      "Doors at 6",
    );
  });
});

describe("eventCardLabel", () => {
  it("joins name, meta, and time, skipping blanks", () => {
    const label = eventCardLabel(event({ organizerName: "GULCH" }));
    expect(label.startsWith("Opening Night, GULCH, ")).toBe(true);
    expect(eventCardLabel(event({ locationName: null }))).toMatch(
      /^Opening Night, Sat Sep 19/,
    );
  });
});
