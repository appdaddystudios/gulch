import { useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";

import { useSaveToast } from "./useSaveToast";
import {
  buildDeck,
  compact,
  DECK_WINDOW,
  remaining as remainingOf,
  swipeLeft,
  swipeRight,
  topEntry,
  type DeckEntry,
  type DeckState,
} from "../lib/deck";
import type { EventListItem } from "../lib/events";
import { captureEvent } from "../lib/telemetry";

const eventsKey = (events: readonly EventListItem[]): string =>
  events.map((event) => event.id).join("|");

const EMPTY_DECK: DeckState = { entries: [], head: 0, deckKey: 0 };

// Owns the Home deck state (lib/deck reducer) and wires the swipe engine's
// callbacks to saving, navigation and telemetry. The engine itself lives in
// components/HomeDeckSection.
export function useHomeDeck(
  events: readonly EventListItem[],
  savedIds: ReadonlySet<string>,
  savedCountMatches: boolean,
) {
  const router = useRouter();
  const { isSaved, toggle, toastVisible, toastNonce, dismissToast, hydrated } =
    useSaveToast();

  // Nothing is dealt until the device's saved ids are known AND the fetched
  // page was queried with that same count. A deck built against the
  // pre-hydration empty set would offer events the user has already
  // favorited — or, once filtered, a short page that a swipe would freeze in
  // place for the session.
  const ready = hydrated && savedCountMatches;
  const [state, setState] = useState<DeckState>(() =>
    ready ? buildDeck(events, savedIds) : EMPTY_DECK,
  );
  // Mirror of `state` for the engine callbacks, which arrive as a burst from
  // the gesture/animation thread — each must see the previous one's result
  // synchronously, not a stale closure.
  const stateRef = useRef(state);
  const savesRef = useRef(0);
  // Whether the CURRENT build produced at least one card. `events` being
  // non-empty is not the same thing: a returning user can have saved every
  // fetched event, and that deck must stay hidden rather than showing the
  // post-session empty state.
  const dealtRef = useRef(state.entries.length > 0);
  // True once a swipe has committed — from then on the session is protected
  // from rebuilds caused by savedIds changes.
  const touchedRef = useRef(false);

  const apply = useCallback((step: (prev: DeckState) => DeckState) => {
    const next = step(stateRef.current);
    stateRef.current = next;
    setState(next);
    return next;
  }, []);

  // A dealt deck is frozen for the rest of the session: once a swipe has
  // committed, neither a new `events` list nor a savedIds change rebuilds it.
  // Home re-runs loadHome after every save, and because the deck query
  // over-fetches past saved ids each save hands back a LONGER list —-
  // rebuilding on that would remount the engine, discard the user's skip
  // order and endlessly replenish the session. Before the first swipe both
  // still rebuild (saved-ids hydration and the first real page can land after
  // the initial render).
  const [seed, setSeed] = useState(() => ({ key: eventsKey(events), savedIds }));
  const key = eventsKey(events);
  const changedUntouched =
    !touchedRef.current && (key !== seed.key || savedIds !== seed.savedIds);
  if (ready && changedUntouched) {
    setSeed({ key, savedIds });
    // Wholesale replacement → bump the key so the engine remounts rather
    // than keeping its old active index.
    const next = {
      ...buildDeck(events, savedIds),
      deckKey: stateRef.current.deckKey + 1,
    };
    stateRef.current = next;
    savesRef.current = 0;
    touchedRef.current = false;
    dealtRef.current = next.entries.length > 0;
    setState(next);
  }

  const emitIfEmptied = useCallback((next: DeckState) => {
    if (remainingOf(next) === 0) {
      captureEvent("deck_emptied", { saved_count: savesRef.current });
    }
  }, []);

  const onSwipeLeft = useCallback(
    (entry: DeckEntry, position: number) => {
      touchedRef.current = true;
      captureEvent("deck_card_swiped", {
        event_id: entry.event.id,
        direction: "skip",
        position,
        pass: entry.pass,
      });
      emitIfEmptied(apply(swipeLeft));
    },
    [apply, emitIfEmptied],
  );

  const onSwipeRight = useCallback(
    (entry: DeckEntry, position: number) => {
      touchedRef.current = true;
      // Idempotent: a card favorited elsewhere mid-session must not be
      // un-saved by a plain toggle.
      if (!isSaved(entry.event.id)) {
        toggle(entry.event.id);
      }
      savesRef.current += 1;
      captureEvent("deck_card_swiped", {
        event_id: entry.event.id,
        direction: "save",
        position,
        pass: entry.pass,
      });
      emitIfEmptied(apply(swipeRight));
    },
    [apply, emitIfEmptied, isSaved, toggle],
  );

  const onIndexChange = useCallback(
    (index: number) => {
      if (index < DECK_WINDOW) {
        return;
      }
      const before = stateRef.current;
      const next = apply(compact);
      if (next !== before) {
        captureEvent("deck_compacted", { remaining: remainingOf(next) });
      }
    },
    [apply],
  );

  const onCardPress = useCallback(
    (entry: DeckEntry) => {
      captureEvent("deck_card_tapped", { event_id: entry.event.id });
      router.push(`/event/${entry.event.id}?source=home_deck`);
    },
    [router],
  );

  return {
    entries: state.entries,
    deckKey: state.deckKey,
    dealt: dealtRef.current,
    top: topEntry(state),
    remaining: remainingOf(state),
    onSwipeLeft,
    onSwipeRight,
    onIndexChange,
    onCardPress,
    toast: { visible: toastVisible, nonce: toastNonce, dismiss: dismissToast },
  };
}
