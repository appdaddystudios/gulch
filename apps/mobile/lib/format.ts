// Atlanta-local by default — all Gulch events are metro Atlanta.
const DEFAULT_TIME_ZONE = "America/New_York";

type FormatEventDateTimeOptions = {
  readonly endAt?: string | null;
  readonly customTimeDescription?: string | null;
  readonly timeZone?: string;
};

const formatTime = (iso: string, timeZone: string): string => {
  const formatted = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  }).format(new Date(iso));
  // Drop ":00" so on-the-hour times read "6 PM" not "6:00 PM".
  return formatted.replace(":00", "");
};

// Builds the Event Details header line, e.g.
// "Saturday, November 22, 2025 · 6 PM – 10 PM".
export const formatEventDateTime = (
  startAt: string,
  {
    endAt,
    customTimeDescription,
    timeZone = DEFAULT_TIME_ZONE,
  }: FormatEventDateTimeOptions = {},
): string => {
  const start = new Date(startAt);
  if (Number.isNaN(start.getTime())) {
    return "";
  }

  const datePart = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone,
  }).format(start);

  const custom = customTimeDescription?.trim();
  const timePart = custom
    ? custom
    : `${formatTime(startAt, timeZone)}${endAt ? ` – ${formatTime(endAt, timeZone)}` : ""}`;

  return timePart ? `${datePart} · ${timePart}` : datePart;
};
