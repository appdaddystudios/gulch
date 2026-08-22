import { createRef, useCallback, useEffect, useMemo, useRef } from 'react';

import type { SwipeableCardRefType } from './SwipeableCard';
import type { RefObject } from 'react';

const RESET_STAGGER_MS = 100;

/**
 * Internal: owns the per-card imperative refs and the staggered reset.
 * Growing `count` (paginated data, design §4) recreates the ref list; that is
 * safe mid-gesture because gesture/animation state lives in shared values —
 * React re-attaches the imperative handles at the next commit.
 *
 * Deck-level controls (swipeLeft/Right/reset) live in SwipeDeck: they write
 * `activeIndex.value`, and react-hooks v6 forbids mutating anything that was
 * passed to a hook as an argument — so the shared value must not pass
 * through here.
 */
export function useCardRefs(count: number) {
  const refs = useMemo(() => {
    const list: RefObject<SwipeableCardRefType | null>[] = [];
    for (let i = 0; i < count; i++) {
      list.push(createRef<SwipeableCardRefType>());
    }
    return list;
  }, [count]);

  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

  const resetCards = useCallback(() => {
    // Reset all cards in the opposite direction with a delay (demo behavior).
    refs.forEach((ref, index) => {
      timeouts.current.push(
        setTimeout(() => {
          ref.current?.reset();
        }, index * RESET_STAGGER_MS),
      );
    });
  }, [refs]);

  useEffect(() => {
    const pending = timeouts.current;
    return () => {
      pending.forEach(timeout => {
        clearTimeout(timeout);
      });
    };
  }, []);

  return {
    refs,
    resetCards,
  };
}
