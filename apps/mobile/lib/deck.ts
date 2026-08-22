// Pure state for the Home swipe deck. The swipe engine (swipedaddy) is linear
// and mounts every item in `data`; this reducer keeps its input append-only
// and bounded so a skipped card can come back (R5) without unbounded mounts.
// No React, no side effects — unit-tested in deck.test.ts.

import type { EventListItem } from "./events";

// Cards loaded into a fresh deck.
export const DECK_CAP = 20;
// Once the engine's active index reaches this, `compact` trims the consumed
// prefix so mounted cards stay <= DECK_CAP + DECK_WINDOW.
export const DECK_WINDOW = 40;

export type DeckEntry = {
  // Unique per mount: `${event.id}:${pass}` — a recycled card is a new entry.
  readonly key: string;
  readonly event: EventListItem;
  // How many times this event has been skipped back to the bottom.
  readonly pass: number;
};

export type DeckState = {
  readonly entries: readonly DeckEntry[];
  // Index of the top card in `entries`; everything before it is consumed.
  readonly head: number;
  // Bumped on every compaction — remounts the engine (wholesale data swap).
  readonly deckKey: number;
};

const entryKey = (id: string, pass: number): string => `${id}:${pass}`;

// R7: only events with a usable hero image are deck material.
export const isDeckEligible = (event: EventListItem): boolean =>
  event.imageStatus === "ok" && Boolean(event.imageUrl);

export const buildDeck = (
  events: readonly EventListItem[],
  savedIds: ReadonlySet<string>,
  cap: number = DECK_CAP,
): DeckState => ({
  entries: events
    .filter((event) => isDeckEligible(event) && !savedIds.has(event.id))
    .slice(0, cap)
    .map((event) => ({ key: entryKey(event.id, 0), event, pass: 0 })),
  head: 0,
  deckKey: 0,
});

export const topEntry = (state: DeckState): DeckEntry | null =>
  state.entries[state.head] ?? null;

export const remaining = (state: DeckState): number =>
  Math.max(0, state.entries.length - state.head);

// Skip: the top card goes to the bottom as a re-keyed copy (R5).
export const swipeLeft = (state: DeckState): DeckState => {
  const top = topEntry(state);
  if (!top) {
    return state;
  }
  const pass = top.pass + 1;
  const recycled: DeckEntry = {
    key: entryKey(top.event.id, pass),
    event: top.event,
    pass,
  };
  return {
    ...state,
    entries: [...state.entries, recycled],
    head: state.head + 1,
  };
};

// Save: the top card leaves the deck for good (R4). Saving itself is the
// caller's job (useSavedEvents) — this only advances the head.
export const swipeRight = (state: DeckState): DeckState =>
  topEntry(state) ? { ...state, head: state.head + 1 } : state;

// Drop the consumed prefix once the engine has advanced DECK_WINDOW cards.
// Returns the same object when nothing needs to change so callers can
// detect a no-op by identity.
export const compact = (state: DeckState): DeckState => {
  if (state.head < DECK_WINDOW) {
    return state;
  }
  return {
    entries: state.entries.slice(state.head),
    head: 0,
    deckKey: state.deckKey + 1,
  };
};
