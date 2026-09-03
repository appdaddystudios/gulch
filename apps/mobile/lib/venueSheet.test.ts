import { describe, expect, it } from "vitest";

import {
  SHEET_PEEK,
  venueCardWidth,
  venueSheetA11yLabel,
  venueSheetCounter,
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

describe("venueSheetCounter", () => {
  it("is absent for a single event", () => {
    expect(venueSheetCounter(0, 1)).toBeNull();
    expect(venueSheetCounter(0, 0)).toBeNull();
  });

  it("is a 1-based position for multi-event venues", () => {
    expect(venueSheetCounter(0, 3)).toBe("1 of 3");
    expect(venueSheetCounter(2, 3)).toBe("3 of 3");
  });
});

describe("venueSheetA11yLabel", () => {
  it("announces a single event without a swipe hint", () => {
    expect(venueSheetA11yLabel("The Earl", 0, 1)).toBe("1 event at The Earl");
  });

  it("announces the count, the position and the swipe hint for several events", () => {
    expect(venueSheetA11yLabel("The Earl", 0, 4)).toBe(
      "4 events at The Earl, showing 1 of 4, swipe to see more",
    );
    expect(venueSheetA11yLabel("The Earl", 3, 4)).toBe(
      "4 events at The Earl, showing 4 of 4, swipe to see more",
    );
  });
});
