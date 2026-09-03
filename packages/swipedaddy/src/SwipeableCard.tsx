import { type ReactNode, type Ref, useCallback, useEffect, useImperativeHandle, useMemo } from 'react';
import {
  StyleSheet,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { SwipeDeckConfig } from './types';
import type { SharedValue } from 'react-native-reanimated';

type SwipeableCardProps = {
  index: number;
  activeIndex: SharedValue<number>;
  config: SwipeDeckConfig;
  cardStyle?: StyleProp<ViewStyle>;
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
  /** Gated mode: a gesture right-swipe springs back to center and fires this
   * instead of committing. The imperative swipeRight() still commits. */
  onSwipeRightIntent?: () => void;
  /** Tap on this card while it is the active card. */
  onPress?: () => void;
  /** Card UI; receives this card's drag progress (translateX / threshold). */
  renderContent: (progress: SharedValue<number>) => ReactNode;
  /** React 19 ref-as-prop (no forwardRef). */
  ref?: Ref<SwipeableCardRefType>;
};

export type SwipeableCardRefType = {
  swipeRight: () => void;
  swipeLeft: () => void;
  reset: () => void;
  /** False when suppressed (card under a finger, or already exited). */
  hint: () => boolean;
};

/** `hint()` timing: out, back, out the other way, then the config spring home. */
const HINT_OUT_MS = 260;
const HINT_BACK_MS = 200;

/** Top card's zIndex; decks larger than this would wrap to negative z. */
const STACK_TOP_Z = 10_000;

/** Internal: one card in the deck — pan gesture, rotation, stack transforms. */
function SwipeableCard({
  index,
  activeIndex,
  config,
  cardStyle,
  onSwipeLeft,
  onSwipeRight,
  onSwipeRightIntent,
  onPress,
  renderContent,
  ref,
}: SwipeableCardProps) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  // Initialized to 0, NOT activeIndex.value: these only become meaningful in
  // onBegin/onUpdate, and reading a shared value during render trips
  // reanimated's strict-mode warning on every rerender.
  const currentActiveIndex = useSharedValue(0);
  const nextActiveIndex = useSharedValue(0);
  // Set in onEnd when this gesture commits a swipe, so onFinalize knows not
  // to spring the card back over its exit animation.
  const committed = useSharedValue(false);
  // Where the card sat when the finger landed. A drag adds its displacement
  // to this, so grabbing a card mid-hint() or mid-spring continues from under
  // the finger instead of snapping to the touch-down origin.
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  // True from the active card's onBegin until its onFinalize. hint() checks it
  // so a nudge never starts on a card the user is already holding — the
  // sequence could carry the card across zero and flip the commit verdict.
  const dragging = useSharedValue(false);
  // True once this card has actually left the deck. A nonzero translation is
  // NOT the same thing — a card being dragged, or springing back from a failed
  // or gated swipe, is still very much in play.
  const exited = useSharedValue(false);

  const { width } = useWindowDimensions();
  const maxCardTranslation = width * config.exitDistanceRatio;
  const spring = config.spring;

  // Transition BEFORE notifying, like the gesture path: a consumer that calls
  // another deck control from its callback (reset() from onSwipeRight, say)
  // must not have its work undone by an advance that lands afterwards.
  const swipeRight = useCallback(() => {
    translateX.value = withSpring(maxCardTranslation, spring);
    exited.value = true;
    activeIndex.value = activeIndex.value + 1;
    onSwipeRight?.();
  }, [activeIndex, exited, maxCardTranslation, onSwipeRight, spring, translateX]);

  const swipeLeft = useCallback(() => {
    translateX.value = withSpring(-maxCardTranslation, spring);
    exited.value = true;
    activeIndex.value = activeIndex.value + 1;
    onSwipeLeft?.();
  }, [activeIndex, exited, maxCardTranslation, onSwipeLeft, spring, translateX]);

  // Gesture commits advance the deck on the UI thread (see onEnd) and use
  // these purely to notify the consumer, so a busy JS thread cannot leave the
  // card still active between the release and the callback.
  const notifySwipeRight = useCallback(() => {
    onSwipeRight?.();
  }, [onSwipeRight]);

  const notifySwipeLeft = useCallback(() => {
    onSwipeLeft?.();
  }, [onSwipeLeft]);

  // A wider window (iPad split-screen, an unfolding device) makes the old exit
  // distance too short, so a discarded card can slide back into view and — with
  // its higher z-index — swallow touches meant for the active card.
  useEffect(() => {
    if (!exited.value) return;
    translateX.value = Math.sign(translateX.value) * maxCardTranslation;
  }, [exited, maxCardTranslation, translateX]);

  const reset = useCallback(() => {
    // A card the deck has already moved past must stay where it exited: a
    // staggered reset() that lands after the user swiped again would
    // otherwise spring a discarded card back to the centre while activeIndex
    // stays advanced.
    if (index < Math.floor(activeIndex.value)) {
      return;
    }
    exited.value = false;
    if (translateX.value !== 0) {
      cancelAnimation(translateX);
      translateX.value = withSpring(0, spring);
    }
    if (translateY.value !== 0) {
      cancelAnimation(translateY);
      translateY.value = withSpring(0, spring);
    }
  }, [activeIndex, exited, index, spring, translateX, translateY]);

  // Demo nudge: right, back, left, back. Only translateX moves, so rotation
  // and `progress` follow for free. No commit, no callbacks, no index change.
  const hint = useCallback(() => {
    if (exited.value || dragging.value) return false;
    const distance = width * config.hintDistanceRatio;
    cancelAnimation(translateX);
    translateX.value = withSequence(
      withTiming(distance, { duration: HINT_OUT_MS }),
      withTiming(0, { duration: HINT_BACK_MS }),
      withTiming(-distance, { duration: HINT_OUT_MS }),
      withSpring(0, spring),
    );
    return true;
  }, [config.hintDistanceRatio, dragging, exited, spring, translateX, width]);

  const rightIntent = useCallback(() => {
    onSwipeRightIntent?.();
  }, [onSwipeRightIntent]);
  const isGated = onSwipeRightIntent != null;

  const press = useCallback(() => {
    onPress?.();
  }, [onPress]);

  useImperativeHandle(ref, () => {
    return {
      swipeLeft,
      swipeRight,
      reset,
      hint,
    };
  }, [swipeLeft, swipeRight, reset, hint]);

  const inputRange = useMemo(() => {
    const threshold = width * config.swipeThresholdRatio;
    return [-threshold, 0, threshold];
  }, [width, config.swipeThresholdRatio]);

  /** Drag position as a fraction of the swipe threshold (±1 at threshold). */
  const progress = useDerivedValue(() => {
    return translateX.value / (width * config.swipeThresholdRatio);
  }, [width, config.swipeThresholdRatio]);

  const rotate = useDerivedValue(() => {
    return interpolate(
      translateX.value,
      inputRange,
      [-config.maxRotationRad, 0, config.maxRotationRad],
      Extrapolation.CLAMP,
    );
  }, [inputRange, config.maxRotationRad]);

  const basePan = Gesture.Pan().withTestId(`swipedaddy-pan-${index}`);
  const offsetPan =
    config.activationOffsetX != null
      ? basePan.activeOffsetX([
          -config.activationOffsetX,
          config.activationOffsetX,
        ])
      : basePan;

  // EXPLICIT 'worklet' directives are REQUIRED here: the worklets babel
  // plugin only auto-workletizes gesture callbacks it can trace back to
  // `Gesture.Pan()` through an UNBROKEN call chain — routing the builder
  // through variables (basePan/offsetPan above) breaks that detection and
  // silently drops the callbacks onto the JS thread (RNGH then warns
  // "None of the callbacks in the gesture are worklets").
  const pan = offsetPan
    .onBegin(() => {
      'worklet';
      currentActiveIndex.value = Math.floor(activeIndex.value);
      // A finger beats any running hint()/reset() motion on the ACTIVE card:
      // freeze it where it is and carry that offset into the drag. Only the
      // active card — a touch that lands on a card still flying out must not
      // freeze it mid-exit.
      if (currentActiveIndex.value === index) {
        cancelAnimation(translateX);
        cancelAnimation(translateY);
        startX.value = translateX.value;
        startY.value = translateY.value;
        dragging.value = true;
      }
      // Clear the previous gesture's verdict. Without this a gesture that
      // never reaches onUpdate (a tap, or a pan that fails the activation
      // offset) would be finalized against a stale commit threshold left by
      // an earlier gated swipe or a reset(), and advance the deck.
      nextActiveIndex.value = currentActiveIndex.value;
      committed.value = false;
    })
    .onUpdate(event => {
      'worklet';
      if (currentActiveIndex.value !== index) return;
      translateX.value = startX.value + event.translationX;
      translateY.value = startY.value + event.translationY;

      nextActiveIndex.value = interpolate(
        translateX.value,
        inputRange,
        [
          currentActiveIndex.value + 1,
          currentActiveIndex.value,
          currentActiveIndex.value + 1,
        ],
        Extrapolation.CLAMP,
      );
    })
    // Commit ONLY here: onEnd runs for a gesture that ended successfully.
    // onFinalize also runs for a cancelled or failed pan — one that lost to a
    // competing native gesture, or was interrupted by the app losing focus —
    // and such a pan keeps its last translation, so deciding there would
    // commit a swipe the user never completed.
    .onEnd(() => {
      'worklet';
      if (currentActiveIndex.value !== index) return;

      // The card's side, not the finger's delta: a drag that started from a
      // hint/spring offset can end on the opposite side of where it moved.
      const sign = Math.sign(translateX.value);
      if (nextActiveIndex.value !== activeIndex.value + 1 || sign === 0) return;

      committed.value = true;
      if (sign === 1) {
        if (isGated) {
          // Gated: bounce back and let the consumer decide the commit
          // (via the imperative swipeRight()).
          translateX.value = withSpring(0, spring);
          translateY.value = withSpring(0, spring);
          scheduleOnRN(rightIntent);
        } else {
          // Exit and advance HERE, on the UI thread. Leaving the advance to
          // the scheduled callback let a busy JS thread keep this card active
          // long enough for a second gesture to grab it; that gesture then
          // failed the commit check and its finalizer sprang the discarded
          // card back over the real active card.
          translateX.value = withSpring(maxCardTranslation, spring);
          exited.value = true;
          activeIndex.value = activeIndex.value + 1;
          scheduleOnRN(notifySwipeRight);
        }
      } else {
        translateX.value = withSpring(-maxCardTranslation, spring);
        exited.value = true;
        activeIndex.value = activeIndex.value + 1;
        scheduleOnRN(notifySwipeLeft);
      }
    })
    // Cleanup only: restore a card whose gesture ended without committing,
    // including cancellations that never reach onEnd.
    .onFinalize(() => {
      'worklet';
      if (currentActiveIndex.value !== index) return;
      dragging.value = false;
      if (committed.value) return;

      translateX.value = withSpring(0, spring);
      translateY.value = withSpring(0, spring);
    });

  const tap = Gesture.Tap()
    .withTestId(`swipedaddy-tap-${index}`)
    .onEnd((_event, success) => {
      'worklet';
      if (!success) return;
      if (Math.floor(activeIndex.value) !== index) return;
      scheduleOnRN(press);
    });

  const gesture = onPress ? Gesture.Exclusive(pan, tap) : pan;

  const rCardStyle = useAnimatedStyle(() => {
    const opacity = withTiming(
      index - activeIndex.value < config.visibleCards ? 1 : 0,
    );
    const transY = withTiming((index - activeIndex.value) * config.stackOffsetY);
    const scale = withTiming(1 - config.stackScaleStep * (index - activeIndex.value));
    return {
      opacity,
      transform: [
        { rotate: `${rotate.value}rad` },
        { translateY: transY },
        { scale: scale },
        {
          translateX: translateX.value,
        },
        {
          translateY: translateY.value,
        },
      ],
    };
  });

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[
          styles.card,
          // POSITIVE stacking only: on Fabric (confirmed RN 0.85/iOS),
          // negative-zIndex children are painted BEHIND ancestor backgrounds
          // — every card except the top one vanishes on screens with a
          // background color. The demo's original `-index` relied on
          // negative z rendering, which is version-dependent.
          { zIndex: STACK_TOP_Z - index },
          cardStyle,
          rCardStyle,
        ]}>
        {renderContent(progress)}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    height: '75%',
    width: '90%',
  },
});

export { SwipeableCard };
