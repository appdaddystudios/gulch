import { describe, expect, it } from "vitest";

import { formatEventDateTime } from "./format";

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
