import { describe, expect, it } from "vitest";

import {
  buildCalendarEvent,
  DEFAULT_EVENT_DURATION_MS,
  mapDialogResult,
  type CalendarEventSource,
} from "./calendarExport";

const base: CalendarEventSource = {
  name: "GULCH Mag Launch",
  startAt: "2026-09-12T23:00:00Z",
  endAt: null,
  customTimeDescription: null,
  locationName: null,
  externalLink: null,
  organizerName: null,
};

describe("buildCalendarEvent", () => {
  it("defaults the end to two hours after the start", () => {
    const payload = buildCalendarEvent(base);

    expect(payload.title).toBe("GULCH Mag Launch");
    expect(payload.startDate.toISOString()).toBe("2026-09-12T23:00:00.000Z");
    expect(payload.endDate.getTime() - payload.startDate.getTime()).toBe(
      DEFAULT_EVENT_DURATION_MS,
    );
  });

  it("uses the explicit end when present", () => {
    const payload = buildCalendarEvent({
      ...base,
      endAt: "2026-09-13T02:30:00Z",
    });

    expect(payload.endDate.toISOString()).toBe("2026-09-13T02:30:00.000Z");
  });

  it("omits optional fields when the event has nothing to say", () => {
    expect(buildCalendarEvent(base)).not.toHaveProperty("location");
    expect(buildCalendarEvent(base)).not.toHaveProperty("notes");
    expect(buildCalendarEvent(base)).not.toHaveProperty("url");
  });

  it("assembles notes from the time note, organizer and link", () => {
    const payload = buildCalendarEvent({
      ...base,
      customTimeDescription: "Doors at 6, show at 7",
      organizerName: "GULCH Magazine",
      externalLink: "https://instagram.com/p/abc",
      locationName: "El Sótano",
    });

    expect(payload.location).toBe("El Sótano");
    expect(payload.url).toBe("https://instagram.com/p/abc");
    expect(payload.notes).toBe(
      "Doors at 6, show at 7\nOrganized by GULCH Magazine\nhttps://instagram.com/p/abc",
    );
  });

  it("skips empty note parts without leaving blank lines", () => {
    const payload = buildCalendarEvent({
      ...base,
      organizerName: "GULCH Magazine",
    });

    expect(payload.notes).toBe("Organized by GULCH Magazine");
  });
});

describe("mapDialogResult", () => {
  it("maps each system dialog outcome", () => {
    expect(mapDialogResult("saved")).toBe("added");
    expect(mapDialogResult("canceled")).toBe("cancelled");
    expect(mapDialogResult("deleted")).toBe("cancelled");
    expect(mapDialogResult("done")).toBe("unknown");
  });
});
