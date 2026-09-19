import { describe, expect, it } from "vitest";

import {
  EVENT_CARD_BORDER,
  EVENT_CARD_PANEL_HEIGHT,
  eventCardHeight,
  eventCardLabel,
  eventCardPanelHeight,
  eventHeroHeight,
  eventMetaLabel,
  eventStatusLabel,
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

  it("grows every text row with the system font scale, never shrinks them", () => {
    // 114pt of text rows (pill 20 + name 48 + meta 21 + status 25) at 1.5×
    // → 171; the 44pt of paddings and gaps stay fixed.
    expect(eventCardPanelHeight(1.5)).toBe(44 + 171);
    expect(eventCardPanelHeight(0.85)).toBe(EVENT_CARD_PANEL_HEIGHT);
    expect(eventCardHeight(370, 1.5) - eventCardHeight(370)).toBe(171 - 114);
  });
});

describe("eventStatusLabel", () => {
  it("picks one status in precedence order", () => {
    expect(eventStatusLabel(event())).toBeNull();
    expect(eventStatusLabel(event({ sponsored: true }))).toBe("Sponsored");
    expect(eventStatusLabel(event({ sponsored: true, ticketsRequired: true }))).toBe(
      "RSVP Required",
    );
    expect(
      eventStatusLabel(event({ sponsored: true, ticketsRequired: true, editorsPick: true })),
    ).toBe("Editor's Pick");
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

  it("announces the visible status last", () => {
    expect(eventCardLabel(event({ ticketsRequired: true }))).toMatch(/, RSVP Required$/);
    expect(eventCardLabel(event({ editorsPick: true }))).toMatch(/, Editor's Pick$/);
  });
});
