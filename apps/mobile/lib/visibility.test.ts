import { describe, expect, it } from "vitest";

import { EVENT_TIME_ZONE, ymdInTimeZone } from "./format";
import {
  currentEventsFilter,
  dayStartIso,
  effectiveEndAt,
  isEventCurrent,
  nextDayStartIso,
  partitionByVisibility,
  ROLLOVER_GRACE_MS,
  rolloverDelayMs,
} from "./visibility";

// Local-hour reader used to pin the invariant "result is 00:00 local".
const localHour = (iso: string, timeZone: string): number =>
  Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      hourCycle: "h23",
      timeZone,
    }).format(new Date(iso)),
  );

describe("dayStartIso", () => {
  it("returns EST midnight for a January instant (V1)", () => {
    // Arrange
    const now = new Date("2026-01-15T15:00:00Z");

    // Act
    const boundary = dayStartIso(now);

    // Assert
    expect(boundary).toBe("2026-01-15T05:00:00.000Z");
  });

  it("returns EDT midnight for a July instant (V2)", () => {
    const boundary = dayStartIso(new Date("2026-07-15T15:00:00Z"));

    expect(boundary).toBe("2026-07-15T04:00:00.000Z");
  });

  it("keeps the EST offset on the spring-forward day (V3)", () => {
    // Midnight on 2026-03-08 is still EST; the clocks jump at 02:00 local.
    const boundary = dayStartIso(new Date("2026-03-08T12:00:00Z"));

    expect(boundary).toBe("2026-03-08T05:00:00.000Z");
  });

  it("keeps the EDT offset on the fall-back day (V4)", () => {
    // Midnight on 2026-11-01 is still EDT; the clocks fall back at 02:00 local.
    const boundary = dayStartIso(new Date("2026-11-01T12:00:00Z"));

    expect(boundary).toBe("2026-11-01T04:00:00.000Z");
  });

  it("stays on the previous day one minute before local midnight (V5)", () => {
    // 03:59Z on Jul 16 is 23:59 EDT on Jul 15.
    const boundary = dayStartIso(new Date("2026-07-16T03:59:00Z"));

    expect(boundary).toBe("2026-07-15T04:00:00.000Z");
  });

  it("moves to the new day one minute after local midnight (V6)", () => {
    const boundary = dayStartIso(new Date("2026-07-16T04:01:00Z"));

    expect(boundary).toBe("2026-07-16T04:00:00.000Z");
  });

  it("lands on 00:00 local of the same calendar day for every pinned instant", () => {
    const instants = [
      "2026-01-15T15:00:00Z",
      "2026-07-15T15:00:00Z",
      "2026-03-08T12:00:00Z",
      "2026-11-01T12:00:00Z",
      "2026-07-16T03:59:00Z",
      "2026-07-16T04:01:00Z",
    ];

    for (const iso of instants) {
      const now = new Date(iso);
      const boundary = dayStartIso(now);

      expect(ymdInTimeZone(new Date(boundary), EVENT_TIME_ZONE)).toEqual(
        ymdInTimeZone(now, EVENT_TIME_ZONE),
      );
      expect(localHour(boundary, EVENT_TIME_ZONE)).toBe(0);
    }
  });

  it("honours an explicit time zone", () => {
    const boundary = dayStartIso(new Date("2026-07-15T15:00:00Z"), "UTC");

    expect(boundary).toBe("2026-07-15T00:00:00.000Z");
  });
});

describe("nextDayStartIso", () => {
  it("steps one EST day forward from a January boundary", () => {
    expect(nextDayStartIso("2026-01-15T05:00:00.000Z")).toBe(
      "2026-01-16T05:00:00.000Z",
    );
  });

  it("lands on the spring-forward day from the day before", () => {
    expect(nextDayStartIso("2026-03-07T05:00:00.000Z")).toBe(
      "2026-03-08T05:00:00.000Z",
    );
  });

  it("crosses the 23 h spring-forward day into EDT", () => {
    expect(nextDayStartIso("2026-03-08T05:00:00.000Z")).toBe(
      "2026-03-09T04:00:00.000Z",
    );
  });

  it("crosses the 25 h fall-back day into EST", () => {
    expect(nextDayStartIso("2026-11-01T04:00:00.000Z")).toBe(
      "2026-11-02T05:00:00.000Z",
    );
  });
});

describe("rolloverDelayMs", () => {
  const boundary = "2026-01-15T05:00:00.000Z";

  it("waits until one grace period past the next boundary", () => {
    const oneHourBefore = Date.parse("2026-01-16T04:00:00.000Z");

    expect(rolloverDelayMs(boundary, oneHourBefore)).toBe(
      3_600_000 + ROLLOVER_GRACE_MS,
    );
  });

  it("clamps to zero once the next boundary has passed", () => {
    const afterNext = Date.parse("2026-01-16T09:00:00.000Z");

    expect(rolloverDelayMs(boundary, afterNext)).toBe(0);
  });
});

describe("effectiveEndAt", () => {
  it("returns endAt when it is on or after startAt", () => {
    expect(
      effectiveEndAt({
        startAt: "2026-10-19T22:00:00Z",
        endAt: "2026-10-20T01:00:00Z",
      }),
    ).toBe("2026-10-20T01:00:00Z");
  });

  it("falls back to startAt when endAt is null", () => {
    expect(
      effectiveEndAt({ startAt: "2026-10-19T22:00:00Z", endAt: null }),
    ).toBe("2026-10-19T22:00:00Z");
  });

  it("falls back to startAt when endAt is before startAt", () => {
    expect(
      effectiveEndAt({
        startAt: "2026-10-19T22:00:00Z",
        endAt: "2026-10-10T00:00:00Z",
      }),
    ).toBe("2026-10-19T22:00:00Z");
  });

  it("falls back to startAt when endAt does not parse", () => {
    expect(
      effectiveEndAt({ startAt: "2026-10-19T22:00:00Z", endAt: "soon" }),
    ).toBe("2026-10-19T22:00:00Z");
  });
});

describe("isEventCurrent", () => {
  // Atlanta day 2026-10-19 (EDT): midnight is 04:00Z.
  const boundary = "2026-10-19T04:00:00.000Z";

  it("is current when the event ends at 11:59 pm today (C1)", () => {
    expect(
      isEventCurrent(
        { startAt: "2026-10-19T22:00:00Z", endAt: "2026-10-20T03:59:00Z" },
        boundary,
      ),
    ).toBe(true);
  });

  it("is past when the event ended at 11:59 pm yesterday (C2)", () => {
    expect(
      isEventCurrent(
        { startAt: "2026-10-18T22:00:00Z", endAt: "2026-10-19T03:59:00Z" },
        boundary,
      ),
    ).toBe(false);
  });

  it("is current for a multi-day run spanning today (C3)", () => {
    expect(
      isEventCurrent(
        { startAt: "2026-10-15T14:00:00Z", endAt: "2026-10-25T22:00:00Z" },
        boundary,
      ),
    ).toBe(true);
  });

  it("is current with a null endAt and a start today (C4)", () => {
    expect(
      isEventCurrent(
        { startAt: "2026-10-19T14:00:00Z", endAt: null },
        boundary,
      ),
    ).toBe(true);
  });

  it("is current when endAt is before startAt and the start is today (C5)", () => {
    expect(
      isEventCurrent(
        { startAt: "2026-10-19T23:00:00Z", endAt: "2026-10-10T00:00:00Z" },
        boundary,
      ),
    ).toBe(true);
  });

  it("is past when endAt is before startAt and both are yesterday (C6)", () => {
    expect(
      isEventCurrent(
        { startAt: "2026-10-18T23:00:00Z", endAt: "2026-10-18T20:00:00Z" },
        boundary,
      ),
    ).toBe(false);
  });

  it("is current when the event starts tomorrow (C7)", () => {
    expect(
      isEventCurrent(
        { startAt: "2026-10-20T23:00:00Z", endAt: null },
        boundary,
      ),
    ).toBe(true);
  });

  it("is never current when startAt does not parse", () => {
    expect(isEventCurrent({ startAt: "tba", endAt: null }, boundary)).toBe(
      false,
    );
  });
});

describe("currentEventsFilter", () => {
  it("builds the PostgREST or-string with the boundary in both terms (F1)", () => {
    const boundary = "2026-10-19T04:00:00.000Z";

    expect(currentEventsFilter(boundary)).toBe(
      "start_at.gte.2026-10-19T04:00:00.000Z,end_at.gte.2026-10-19T04:00:00.000Z",
    );
  });
});

describe("partitionByVisibility", () => {
  const boundary = "2026-10-19T04:00:00.000Z";
  const mk = (id: string, startAt: string, endAt: string | null = null) => ({
    id,
    startAt,
    endAt,
  });

  it("keeps input order within each half and loses nothing (P1)", () => {
    // Arrange: ascending by start, past and current interleaved by end_at.
    const events = Object.freeze([
      mk("a", "2026-10-17T22:00:00Z"),
      mk("b", "2026-10-18T14:00:00Z", "2026-10-21T00:00:00Z"),
      mk("c", "2026-10-18T22:00:00Z"),
      mk("d", "2026-10-19T14:00:00Z"),
      mk("e", "2026-10-20T14:00:00Z"),
    ]);

    // Act
    const { current, past } = partitionByVisibility(events, boundary);

    // Assert
    expect(current.map((event) => event.id)).toEqual(["b", "d", "e"]);
    expect(past.map((event) => event.id)).toEqual(["a", "c"]);
    expect(current.length + past.length).toBe(events.length);
    expect(events.map((event) => event.id)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("returns two empty halves for no events", () => {
    expect(partitionByVisibility([], boundary)).toEqual({
      current: [],
      past: [],
    });
  });
});
