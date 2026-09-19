import { describe, expect, it } from "vitest";

import { SHEET_PEEK, venueCardWidth } from "./venueSheet";

describe("venueCardWidth", () => {
  it("fills the window minus both gutters for a single-event venue", () => {
    expect(venueCardWidth(402, 8, 1)).toBe(402 - 16);
  });

  it("leaves a peek for the next card when a venue has several events", () => {
    expect(venueCardWidth(402, 8, 2)).toBe(402 - 16 - SHEET_PEEK);
    expect(venueCardWidth(402, 8, 7)).toBe(402 - 16 - SHEET_PEEK);
  });

  it("treats zero events like a single card (no peek)", () => {
    expect(venueCardWidth(402, 8, 0)).toBe(402 - 16);
  });
});
