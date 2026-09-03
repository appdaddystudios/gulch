import { describe, expect, it } from "vitest";

import {
  SHEET_PEEK,
  venueCardWidth,
  venueSheetA11yLabel,
  venueSheetTitle,
} from "./venueSheet";

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

describe("venueSheetTitle", () => {
  it("returns just the venue name for a single event", () => {
    expect(venueSheetTitle("The Earl", 0, 1)).toBe("The Earl");
  });

  it("appends a 1-based position for multi-event venues", () => {
    expect(venueSheetTitle("The Earl", 0, 3)).toBe("The Earl · 1 of 3");
    expect(venueSheetTitle("The Earl", 2, 3)).toBe("The Earl · 3 of 3");
  });
});

describe("venueSheetA11yLabel", () => {
  it("announces a single event without a swipe hint", () => {
    expect(venueSheetA11yLabel("The Earl", 1)).toBe("1 event at The Earl");
  });

  it("announces the count and the swipe hint for several events", () => {
    expect(venueSheetA11yLabel("The Earl", 4)).toBe(
      "4 events at The Earl, swipe to see more",
    );
  });
});
