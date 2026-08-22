import {
  SwipeDeck,
  type SwipeDeckConfig,
  type SwipeDeckRef,
} from "@fontezbrooks/swipedaddy";
import { useRef } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import type { AccessibilityActionEvent } from "react-native";

import { DeckCard, deckCardLabel } from "./DeckCard";
import { EmptyState } from "./EmptyState";
import { SwipeStamps } from "./SwipeStamps";
import { Toast } from "./Toast";
import { useHomeDeck } from "../hooks/useHomeDeck";
import type { DeckEntry } from "../lib/deck";
import type { EventListItem } from "../lib/events";
import { space } from "../theme";

// Gesture feel carried over from TheSouthernShmooze's tuned deck: commit at
// 0.28 × width, 2.8° tilt at the threshold, a visible stack of 3.
const DECK_CONFIG: Partial<SwipeDeckConfig> = {
  activationOffsetX: 12,
  exitDistanceRatio: 1.5,
  maxRotationRad: (10 * Math.PI) / 180 / (1 / 0.28),
  spring: { damping: 20, mass: 0.7, stiffness: 220 },
  stackOffsetY: 14,
  stackScaleStep: 0.05,
  swipeThresholdRatio: 0.28,
  visibleCards: 3,
};
const STACK_PEEK = DECK_CONFIG.stackOffsetY ?? 0;
const STACK_DEPTH = (DECK_CONFIG.visibleCards ?? 1) - 1;
// Figma: 370 on a 402pt screen → 16pt inset each side. Square card.
const CARD_INSET = space.xl * 2;
const STACK_BOTTOM_GAP = space.md;

// `activate` is what a screen-reader double tap fires. The grouped container
// hides the card's own tap gesture from assistive tech, so without it the
// hint below would promise an interaction nobody could perform.
const A11Y_ACTIONS = [
  { name: "activate", label: "Open event" },
  { name: "save", label: "Save event" },
  { name: "skip", label: "Skip event" },
];

type HomeDeckSectionProps = {
  readonly events: readonly EventListItem[];
  readonly savedIds: ReadonlySet<string>;
  /** The fetched page was queried with the current saved-id count. */
  readonly savedCountMatches: boolean;
};

// Home V3.1 swipe deck: right = save, left = back to the bottom, tap = open.
// Hidden when there is nothing to deal at load; an empty state once the user
// has saved every card.
export function HomeDeckSection({
  events,
  savedIds,
  savedCountMatches,
}: HomeDeckSectionProps) {
  const deckRef = useRef<SwipeDeckRef>(null);
  const { width } = useWindowDimensions();
  const deck = useHomeDeck(events, savedIds, savedCountMatches);

  // Nothing was dealt: either the query came back empty or every fetched
  // event is already saved. Either way the section stays hidden.
  if (!deck.dealt) {
    return null;
  }

  // The last card's save updates the toast and the deck in the same batch, so
  // the empty state has to carry the toast too — otherwise the save that
  // empties the deck is the one save that never confirms.
  if (deck.remaining === 0) {
    return (
      <View style={styles.deck}>
        <EmptyState
          title="You've saved them all"
          subtitle="Find more in Calendar"
        />
        <Toast
          key={deck.toast.nonce}
          message="Added to your favorites"
          visible={deck.toast.visible}
          onDismiss={deck.toast.dismiss}
        />
      </View>
    );
  }

  const cardSize = width - CARD_INSET;
  const height = cardSize + STACK_PEEK * STACK_DEPTH + STACK_BOTTOM_GAP;
  const label = deck.top
    ? `${deckCardLabel(deck.top.event)}. ${deck.remaining} to go`
    : `Event deck, ${deck.remaining} to go`;

  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    const action = event.nativeEvent.actionName;
    if (action === "activate") {
      if (deck.top) {
        deck.onCardPress(deck.top);
      }
    } else if (action === "save") {
      deckRef.current?.swipeRight();
    } else if (action === "skip") {
      deckRef.current?.swipeLeft();
    }
  };

  return (
    <View
      accessible
      accessibilityActions={A11Y_ACTIONS}
      accessibilityHint="Swipe right to save, left to skip, double tap to open"
      accessibilityLabel={label}
      onAccessibilityAction={onAccessibilityAction}
      style={[styles.deck, { height }]}
    >
      <SwipeDeck<DeckEntry>
        ref={deckRef}
        key={deck.deckKey}
        cardStyle={{ width: cardSize, height: cardSize, top: 0 }}
        config={DECK_CONFIG}
        data={deck.entries as DeckEntry[]}
        keyExtractor={(entry) => entry.key}
        onActiveIndexChange={deck.onIndexChange}
        onCardPress={deck.onCardPress}
        onSwipeLeft={deck.onSwipeLeft}
        onSwipeRight={deck.onSwipeRight}
        renderCard={(entry, _index, progress) => (
          <>
            <DeckCard event={entry.event} />
            <SwipeStamps progress={progress} />
          </>
        )}
      />
      <Toast
        key={deck.toast.nonce}
        message="Added to your favorites"
        visible={deck.toast.visible}
        onDismiss={deck.toast.dismiss}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  deck: {
    width: "100%",
  },
});
