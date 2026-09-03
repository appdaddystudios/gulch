// Pure mapping from an event to the payload the system "New Event" sheet is
// pre-filled with. Named to stay clear of lib/calendar.ts (the month grid).

import type { EventListItem } from "./events";

export const DEFAULT_EVENT_DURATION_MS = 2 * 60 * 60 * 1000;

export type CalendarEventPayload = {
  readonly title: string;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly location?: string;
  readonly notes?: string;
  readonly url?: string;
};

export type CalendarEventSource = Pick<
  EventListItem,
  | "name"
  | "startAt"
  | "endAt"
  | "customTimeDescription"
  | "locationName"
  | "externalLink"
  | "organizerName"
>;

// Events without an end get a two-hour block; the sheet lets the user adjust.
export const buildCalendarEvent = (
  event: CalendarEventSource,
): CalendarEventPayload => {
  const startDate = new Date(event.startAt);
  const endDate = event.endAt
    ? new Date(event.endAt)
    : new Date(startDate.getTime() + DEFAULT_EVENT_DURATION_MS);
  const notes = [
    event.customTimeDescription,
    event.organizerName ? `Organized by ${event.organizerName}` : null,
    event.externalLink,
  ]
    .filter((part): part is string => Boolean(part))
    .join("\n");

  return {
    title: event.name,
    startDate,
    endDate,
    ...(event.locationName ? { location: event.locationName } : {}),
    ...(notes ? { notes } : {}),
    ...(event.externalLink ? { url: event.externalLink } : {}),
  };
};

export type CalendarExportResult = "added" | "cancelled" | "unknown" | "error";

export type CalendarDialogAction = "saved" | "canceled" | "deleted" | "done";

// Android only ever reports `done` (the OS doesn't say whether the user saved),
// so that maps to `unknown` rather than claiming a save.
export const mapDialogResult = (
  action: CalendarDialogAction,
): CalendarExportResult => {
  switch (action) {
    case "saved":
      return "added";
    case "canceled":
    case "deleted":
      return "cancelled";
    case "done":
      return "unknown";
  }
};
