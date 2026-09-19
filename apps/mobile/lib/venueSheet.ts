// Pure layout helpers for the Map tab's venue cards (the horizontal
// event-card row over a selected pin). Kept theme-free so they unit-test in
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
