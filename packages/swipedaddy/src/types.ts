import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type { SharedValue, WithSpringConfig } from 'react-native-reanimated';

export type SwipeDeckConfig = {
  /** How many cards are visible in the stack behind the active card. */
  visibleCards: number;
  /** Vertical offset (px) per depth level in the stack. */
  stackOffsetY: number;
  /** Scale lost per depth level in the stack. */
  stackScaleStep: number;
  /** Max card rotation (radians) at the swipe threshold. */
  maxRotationRad: number;
  /** Fraction of the window width that commits a swipe. */
  swipeThresholdRatio: number;
  /** How far (× window width) a swiped card travels off screen. */
  exitDistanceRatio: number;
  /** Spring used for all card motion (return-to-center, exit fling, reset). */
  spring?: WithSpringConfig;
  /**
   * Horizontal drag (px) before the pan engages (`activeOffsetX`). Lets taps
   * and vertical scrolls through; omit for the demo's immediate grab.
   */
  activationOffsetX?: number;
};

export type SwipeDeckRef = {
  swipeLeft: () => void;
  swipeRight: () => void;
  /** Restores the full deck with a staggered animation. */
  reset: () => void;
  /**
   * UI-thread observable position — read it from worklets/animated styles to
   * animate other UI in sync with swipes. For plain React state, use
   * `onActiveIndexChange` instead.
   */
  activeIndex: SharedValue<number>;
};

export type SwipeDeckProps<T> = {
  /** Cards, top of the deck first. May GROW over time (paginated fetches) —
   * appending is safe mid-gesture; replacing wholesale needs a remount
   * (change the deck's `key`). */
  data: T[];
  /**
   * Card UI. `progress` is that card's live drag position as a fraction of
   * the swipe threshold (0 centered, ±1 at the threshold, unclamped) — drive
   * like/pass cues from it in animated styles.
   */
  renderCard: (
    item: T,
    index: number,
    progress: SharedValue<number>,
  ) => ReactNode;
  /** Stable card identity; defaults to the array index. */
  keyExtractor?: (item: T, index: number) => string;
  onSwipeLeft?: (item: T, index: number) => void;
  onSwipeRight?: (item: T, index: number) => void;
  /**
   * GATED MODE: when set, a GESTURE right-swipe does not commit — the card
   * springs back to center and this fires instead. The imperative
   * `swipeRight()` still commits (fling + advance), which is how a consumer
   * completes a confirmed match. Left swipes always commit.
   */
  onSwipeRightIntent?: (item: T, index: number) => void;
  /** Tap on the ACTIVE card (composed exclusively with the pan). */
  onCardPress?: (item: T, index: number) => void;
  /** JS-thread mirror of the active index (e.g. "card 3 of 10", prefetching). */
  onActiveIndexChange?: (index: number) => void;
  /** The last card has left the deck. */
  onDeckEnd?: () => void;
  config?: Partial<SwipeDeckConfig>;
  /** Size/position of the card slot (default: 90% × 75%, centered). */
  cardStyle?: StyleProp<ViewStyle>;
};
