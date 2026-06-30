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
