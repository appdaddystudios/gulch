import { describe, expect, it } from "vitest";

import {
  addMonths,
  dayNumber,
  monthCursorFromKey,
  monthGrid,
  monthTitle,
} from "./calendar";

describe("addMonths", () => {
  it("advances within a year", () => {
    expect(addMonths({ year: 2025, monthIndex: 5 }, 1)).toEqual({
      year: 2025,
      monthIndex: 6,
    });
  });

  it("wraps forward across a year boundary", () => {
    expect(addMonths({ year: 2025, monthIndex: 11 }, 1)).toEqual({
      year: 2026,
      monthIndex: 0,
    });
  });

  it("wraps backward across a year boundary", () => {
    expect(addMonths({ year: 2025, monthIndex: 0 }, -1)).toEqual({
      year: 2024,
      monthIndex: 11,
    });
  });
});

describe("monthCursorFromKey", () => {
  it("parses a day key into a cursor", () => {
    expect(monthCursorFromKey("2025-07-15")).toEqual({
      year: 2025,
      monthIndex: 6,
    });
  });
});

describe("monthTitle", () => {
  it("upper-cases the month name", () => {
    expect(monthTitle({ year: 2025, monthIndex: 6 })).toBe("JULY");
  });
});

describe("monthGrid", () => {
  it("pads leading days and fills full weeks", () => {
    // July 2025 starts on a Tuesday (2 leading nulls), 31 days -> 35 cells.
    const grid = monthGrid({ year: 2025, monthIndex: 6 });
    expect(grid).toHaveLength(35);
    expect(grid.slice(0, 2)).toEqual([null, null]);
    expect(grid[2]).toBe("2025-07-01");
    expect(grid[32]).toBe("2025-07-31");
    expect(grid[33]).toBeNull();
    expect(grid.length % 7).toBe(0);
  });
});

describe("dayNumber", () => {
  it("strips the leading zero", () => {
    expect(dayNumber("2025-07-07")).toBe("7");
    expect(dayNumber("2025-07-31")).toBe("31");
  });
});
