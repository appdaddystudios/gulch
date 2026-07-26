// Pure month-grid math for the Events Browse Calendar. Day keys are
// "YYYY-MM-DD" strings (matching lib/format.dayKey) so the calendar can be
// compared against event days without timezone surprises.

export type MonthCursor = {
  readonly year: number;
  readonly monthIndex: number; // 0 = January
};

export const addMonths = (cursor: MonthCursor, delta: number): MonthCursor => {
  const total = cursor.year * 12 + cursor.monthIndex + delta;
  return { year: Math.floor(total / 12), monthIndex: ((total % 12) + 12) % 12 };
};

export const monthCursorFromKey = (key: string): MonthCursor => {
  const [year, month] = key.split("-").map(Number);
  return { year: year as number, monthIndex: (month as number) - 1 };
};

export const monthTitle = (cursor: MonthCursor): string =>
  new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" })
    .format(new Date(Date.UTC(cursor.year, cursor.monthIndex, 1)))
    .toUpperCase();

const dayKeyFor = (cursor: MonthCursor, day: number): string =>
  `${cursor.year}-${String(cursor.monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

// Flat list of cells aligned to a Sunday-start week. null = padding cell.
export const monthGrid = (cursor: MonthCursor): readonly (string | null)[] => {
  const firstDow = new Date(Date.UTC(cursor.year, cursor.monthIndex, 1)).getUTCDay();
  const daysInMonth = new Date(
    Date.UTC(cursor.year, cursor.monthIndex + 1, 0),
  ).getUTCDate();

  const cells: (string | null)[] = [];
  for (let i = 0; i < firstDow; i += 1) {
    cells.push(null);
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(dayKeyFor(cursor, day));
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  return cells;
};

// Day-of-month number ("1".."31") from a day key.
export const dayNumber = (key: string): string => String(Number(key.slice(8, 10)));

// Day keys are timezone-less "YYYY-MM-DD"; pinning UTC keeps the math pure.
const keyToUtcDate = (key: string): Date => new Date(`${key}T00:00:00Z`);

export const addDaysToKey = (key: string, delta: number): string => {
  const date = keyToUtcDate(key);
  date.setUTCDate(date.getUTCDate() + delta);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
};

// Same day-of-month `delta` months away, clamped to the target month's length
// (Jan 31 stepped forward lands on Feb 28/29, not Mar 3).
export const addMonthsToKey = (key: string, delta: number): string => {
  const cursor = addMonths(monthCursorFromKey(key), delta);
  const day = Number(key.slice(8, 10));
  const daysInMonth = new Date(
    Date.UTC(cursor.year, cursor.monthIndex + 1, 0),
  ).getUTCDate();
  return dayKeyFor(cursor, Math.min(day, daysInMonth));
};

// The Sunday-start week containing `key`, as 7 day keys.
export const weekOf = (key: string): readonly string[] => {
  const start = addDaysToKey(key, -keyToUtcDate(key).getUTCDay());
  return Array.from({ length: 7 }, (_, index) => addDaysToKey(start, index));
};

// "Friday, July 11, 2026" — the V3 day-stepper label.
export const dayTitle = (key: string): string =>
  new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(keyToUtcDate(key));

// "July 2026" — the V3 calendar heading.
export const monthYearTitle = (cursor: MonthCursor): string =>
  new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(cursor.year, cursor.monthIndex, 1)));
