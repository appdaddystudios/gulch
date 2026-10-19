import { EVENT_TIME_ZONE, ymdInTimeZone } from "./format";

// The visibility rule (docs/event-visibility): an event is current until
// local midnight after its last day. Server and client share these helpers.

const HOUR_MS = 3_600_000;
// Grace so a rollover check runs after the clock has crossed midnight, not on it.
export const ROLLOVER_GRACE_MS = 1_000;

type VisibilityWindow = {
  readonly startAt: string;
  readonly endAt: string | null;
};

type VisibilityPartition<T> = {
  readonly current: readonly T[];
  readonly past: readonly T[];
};

// Reads `instant`'s wall clock in `timeZone` and re-encodes it as if it were
// UTC, so the difference to `instant` is the zone's offset at that moment.
const wallClockAsUtc = (instant: number, timeZone: string): number => {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).formatToParts(new Date(instant));
  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value);
  return Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    read("hour"),
    read("minute"),
    read("second"),
  );
};

// UTC instant of 00:00 local on the calendar day containing `now`. Two offset
// passes cover a DST transition between the guess and the true midnight.
export const dayStartIso = (
  now: Date,
  timeZone: string = EVENT_TIME_ZONE,
): string => {
  const [year, month, day] = ymdInTimeZone(now, timeZone);
  const guess = Date.UTC(year, month - 1, day);
  const firstOffset = wallClockAsUtc(guess, timeZone) - guess;
  const firstPass = guess - firstOffset;
  const secondOffset = wallClockAsUtc(firstPass, timeZone) - firstPass;
  const result =
    secondOffset === firstOffset ? firstPass : guess - secondOffset;
  return new Date(result).toISOString();
};

// Boundary of the day after `boundaryIso`. A local day is 23-25 h, so +26 h
// always lands inside the following day.
export const nextDayStartIso = (boundaryIso: string): string =>
  dayStartIso(new Date(Date.parse(boundaryIso) + 26 * HOUR_MS));

// Milliseconds from `nowMs` until just past the next local midnight; 0 once
// that midnight has already passed.
export const rolloverDelayMs = (boundaryIso: string, nowMs: number): number =>
  Math.max(
    0,
    Date.parse(nextDayStartIso(boundaryIso)) - nowMs + ROLLOVER_GRACE_MS,
  );

// end_at when it parses and is not before start_at; otherwise start_at.
export const effectiveEndAt = (event: VisibilityWindow): string => {
  if (event.endAt === null) {
    return event.startAt;
  }
  const end = Date.parse(event.endAt);
  const start = Date.parse(event.startAt);
  return end >= start ? event.endAt : event.startAt;
};

export const isEventCurrent = (
  event: VisibilityWindow,
  boundaryIso: string,
): boolean => Date.parse(effectiveEndAt(event)) >= Date.parse(boundaryIso);

// PostgREST or-filter equivalent to isEventCurrent; a null end_at fails the
// second term, which is the fallback-to-start behaviour.
export const currentEventsFilter = (boundaryIso: string): string =>
  `start_at.gte.${boundaryIso},end_at.gte.${boundaryIso}`;

export const partitionByVisibility = <T extends VisibilityWindow>(
  events: readonly T[],
  boundaryIso: string,
): VisibilityPartition<T> => ({
  current: events.filter((event) => isEventCurrent(event, boundaryIso)),
  past: events.filter((event) => !isEventCurrent(event, boundaryIso)),
});
