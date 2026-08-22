import { createRef, useCallback, useEffect, useMemo, useRef } from 'react';

import type { SwipeableCardRefType } from './SwipeableCard';
import type { RefObject } from 'react';

const RESET_STAGGER_MS = 100;

/**
 * Internal: owns the per-card imperative refs and the staggered reset.
 * Growing `count` (paginated data, design §4) APPENDS refs and keeps the
 * existing ones: recreating them detaches the handles a pending reset
 * stagger already closed over, so those callbacks would see a null
 * `ref.current` and silently skip restoring their card.
 *
 * Deck-level controls (swipeLeft/Right/reset) live in SwipeDeck: they write
 * `activeIndex.value`, and react-hooks v6 forbids mutating anything that was
 * passed to a hook as an argument — so the shared value must not pass
 * through here.
 */
export function useCardRefs(count: number) {
  const store = useRef<RefObject<SwipeableCardRefType | null>[]>([]);
  const refs = useMemo(() => {
    const list = store.current.slice(0, count);
    while (list.length < count) {
      list.push(createRef<SwipeableCardRefType>());
    }
    store.current = list;
    return list;
  }, [count]);

  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

  const cancelPendingResets = useCallback(() => {
    // Empty in place rather than replacing the array: the unmount cleanup
    // holds this same reference, and swapping it would leave that cleanup
    // clearing an array the live timers no longer live in.
    timeouts.current.forEach(timeout => {
      clearTimeout(timeout);
    });
    timeouts.current.length = 0;
  }, []);

  const resetCards = useCallback(() => {
    // Reset all cards in the opposite direction with a delay (demo behavior).
    // Drop any stagger still in flight first: a pending reset that fires after
    // a new swipe would cancel that card's exit animation and spring an
    // already-discarded card back to the centre while activeIndex stays put.
    cancelPendingResets();
    refs.forEach((ref, index) => {
      timeouts.current.push(
        setTimeout(() => {
          ref.current?.reset();
        }, index * RESET_STAGGER_MS),
      );
    });
  }, [cancelPendingResets, refs]);

  useEffect(() => {
    return () => {
      cancelPendingResets();
    };
  }, [cancelPendingResets]);

  return {
    refs,
    resetCards,
  };
}
