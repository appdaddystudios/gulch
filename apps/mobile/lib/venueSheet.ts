// Pure layout/copy helpers for the Map tab's venue sheet (the horizontal
// event-card row under a selected pin). Kept theme-free so they unit-test in
// node: the caller passes the gutter it lays out with.

// How much of the next card shows past the right edge when a venue has more
// than one event — the cue that the row scrolls.
export const SHEET_PEEK = 32;

export const venueCardWidth = (
  windowWidth: number,
  gutter: number,
  count: number,
): number =>
  count > 1 ? windowWidth - gutter * 2 - SHEET_PEEK : windowWidth - gutter * 2;

// "Venue · 2 of 5" while scrolling a multi-event venue; just the name otherwise.
export const venueSheetTitle = (
  name: string,
  index: number,
  count: number,
): string => (count > 1 ? `${name} · ${index + 1} of ${count}` : name);

export const venueSheetA11yLabel = (name: string, count: number): string =>
  count > 1
    ? `${count} events at ${name}, swipe to see more`
    : `1 event at ${name}`;
