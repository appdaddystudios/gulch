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

type FormatCompactOptions = {
  readonly endAt?: string | null;
  readonly timeZone?: string;
};

const compactTime = (iso: string, timeZone: string): string =>
  formatTime(iso, timeZone)
    // "5 PM" -> "5pm", "5:30 PM" -> "5:30pm"
    .replace(/\s?(AM|PM)$/i, (_match, meridiem: string) =>
      meridiem.toLowerCase(),
    );

// Compact label for Event Card time pills, e.g. "Sat Jun 5 · 5pm – 7pm".
export const formatEventTimeCompact = (
  startAt: string,
  { endAt, timeZone = DEFAULT_TIME_ZONE }: FormatCompactOptions = {},
): string => {
  const start = new Date(startAt);
  if (Number.isNaN(start.getTime())) {
    return "";
  }

  // Compose weekday + month/day separately to avoid Intl's "Thu, Jun 5" comma.
  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone,
  }).format(start);
  const monthDay = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone,
  }).format(start);

  const timePart = `${compactTime(startAt, timeZone)}${endAt ? ` – ${compactTime(endAt, timeZone)}` : ""}`;
  return `${weekday} ${monthDay} · ${timePart}`;
};

const ymdInTimeZone = (
  date: Date,
  timeZone: string,
): [number, number, number] => {
  // en-CA renders as YYYY-MM-DD.
  const [year, month, day] = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  })
    .format(date)
    .split("-")
    .map(Number);
  return [year as number, month as number, day as number];
};

// Sunday-of-the-week date key (YYYY-MM-DD) for the event's local calendar day.
// Used to bucket events into week groups on the Events list.
export const weekStartKey = (
  iso: string,
  timeZone: string = DEFAULT_TIME_ZONE,
): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const [year, month, day] = ymdInTimeZone(date, timeZone);
  const local = new Date(Date.UTC(year, month - 1, day));
  local.setUTCDate(local.getUTCDate() - local.getUTCDay());
  return local.toISOString().slice(0, 10);
};

// Human label for a week bucket, e.g. "Jun 22 – 28" or "Jun 28 – Jul 4".
export const formatWeekRange = (weekStartKeyValue: string): string => {
  const start = new Date(`${weekStartKeyValue}T12:00:00Z`);
  if (Number.isNaN(start.getTime())) {
    return "";
  }
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);

  const monthDay = (date: Date) =>
    new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(date);
  const monthOf = (date: Date) =>
    new Intl.DateTimeFormat("en-US", {
      month: "short",
      timeZone: "UTC",
    }).format(date);

  const endLabel =
    monthOf(start) === monthOf(end)
      ? new Intl.DateTimeFormat("en-US", {
          day: "numeric",
          timeZone: "UTC",
        }).format(end)
      : monthDay(end);

  return `${monthDay(start)} – ${endLabel}`;
};
