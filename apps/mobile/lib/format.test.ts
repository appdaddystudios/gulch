import { describe, expect, it } from "vitest";

import {
  dayKey,
  formatEventDateTime,
  formatEventTimeCompact,
  formatWeekRange,
  weekStartKey,
} from "./format";

describe("formatEventDateTime", () => {
  it("formats a start/end range, dropping on-the-hour minutes", () => {
    expect(
      formatEventDateTime("2025-11-22T18:00:00Z", {
        endAt: "2025-11-22T22:00:00Z",
        timeZone: "UTC",
      }),
    ).toBe("Saturday, November 22, 2025 · 6 PM – 10 PM");
  });

  it("keeps non-zero minutes", () => {
    expect(
      formatEventDateTime("2025-11-22T18:30:00Z", { timeZone: "UTC" }),
    ).toBe("Saturday, November 22, 2025 · 6:30 PM");
  });

  it("prefers a custom time description when present", () => {
    expect(
      formatEventDateTime("2025-11-22T18:00:00Z", {
        endAt: "2025-11-22T22:00:00Z",
        customTimeDescription: "Doors at 6, show at 7",
        timeZone: "UTC",
      }),
    ).toBe("Saturday, November 22, 2025 · Doors at 6, show at 7");
  });

  it("ignores a blank custom time description", () => {
    expect(
      formatEventDateTime("2025-11-22T18:00:00Z", {
        customTimeDescription: "   ",
        timeZone: "UTC",
      }),
    ).toBe("Saturday, November 22, 2025 · 6 PM");
  });

  it("returns an empty string for an invalid date", () => {
    expect(formatEventDateTime("not-a-date")).toBe("");
  });
});

describe("formatEventTimeCompact", () => {
  it("formats an abbreviated date with a lowercase time range", () => {
    expect(
      formatEventTimeCompact("2025-06-05T17:00:00Z", {
        endAt: "2025-06-05T19:00:00Z",
        timeZone: "UTC",
      }),
    ).toBe("Thu Jun 5 · 5pm – 7pm");
  });

  it("handles a start-only time and keeps non-zero minutes", () => {
    expect(
      formatEventTimeCompact("2025-06-05T17:30:00Z", { timeZone: "UTC" }),
    ).toBe("Thu Jun 5 · 5:30pm");
  });

  it("returns an empty string for an invalid date", () => {
    expect(formatEventTimeCompact("nope")).toBe("");
  });
});

describe("dayKey", () => {
  it("returns the local calendar day", () => {
    expect(dayKey("2025-07-07T13:00:00Z", "UTC")).toBe("2025-07-07");
  });

  it("returns an empty string for an invalid date", () => {
    expect(dayKey("nope")).toBe("");
  });
});

describe("weekStartKey", () => {
  it("returns the Sunday on or before the event day", () => {
    // 2025-06-05 is a Thursday; the prior Sunday is 2025-06-01.
    expect(weekStartKey("2025-06-05T17:00:00Z", "UTC")).toBe("2025-06-01");
  });

  it("returns an empty string for an invalid date", () => {
    expect(weekStartKey("nope")).toBe("");
  });
});

describe("formatWeekRange", () => {
  it("collapses the month when the week stays within one", () => {
    expect(formatWeekRange("2025-06-01")).toBe("Jun 1 – 7");
  });

  it("shows both months when the week crosses a boundary", () => {
    expect(formatWeekRange("2025-06-29")).toBe("Jun 29 – Jul 5");
  });

  it("returns an empty string for an invalid key", () => {
    expect(formatWeekRange("nope")).toBe("");
  });
});
