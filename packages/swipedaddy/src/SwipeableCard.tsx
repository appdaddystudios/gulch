import {
  useCallback,
  useImperativeHandle,
  useMemo,
  type ReactNode,
  type Ref,
} from 'react';
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
};

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

  const { width } = useWindowDimensions();
  const maxCardTranslation = width * config.exitDistanceRatio;
  const spring = config.spring;

  const swipeRight = useCallback(() => {
    onSwipeRight?.();
    translateX.value = withSpring(maxCardTranslation, spring);
    activeIndex.value = activeIndex.value + 1;
  }, [activeIndex, maxCardTranslation, onSwipeRight, spring, translateX]);

  const swipeLeft = useCallback(() => {
    onSwipeLeft?.();
    translateX.value = withSpring(-maxCardTranslation, spring);
    activeIndex.value = activeIndex.value + 1;
  }, [activeIndex, maxCardTranslation, onSwipeLeft, spring, translateX]);

  const reset = useCallback(() => {
    if (translateX.value !== 0) {
      cancelAnimation(translateX);
      translateX.value = withSpring(0, spring);
    }
    if (translateY.value !== 0) {
      cancelAnimation(translateY);
      translateY.value = withSpring(0, spring);
    }
  }, [spring, translateX, translateY]);

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
    };
  }, [swipeLeft, swipeRight, reset]);

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
      // Clear the previous gesture's verdict. Without this a gesture that
      // never reaches onUpdate (a tap, or a pan that fails the activation
      // offset) would be finalized against a stale commit threshold left by
      // an earlier gated swipe or a reset(), and advance the deck.
      nextActiveIndex.value = currentActiveIndex.value;
    })
    .onUpdate(event => {
      'worklet';
      if (currentActiveIndex.value !== index) return;
      translateX.value = event.translationX;
      translateY.value = event.translationY;

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
    .onFinalize(event => {
      'worklet';
      if (currentActiveIndex.value !== index) return;

      const sign = Math.sign(event.translationX);
      if (nextActiveIndex.value === activeIndex.value + 1 && sign !== 0) {
        if (sign === 1) {
          if (isGated) {
            // Gated: bounce back and let the consumer decide the commit
            // (via the imperative swipeRight()).
            translateX.value = withSpring(0, spring);
            translateY.value = withSpring(0, spring);
            scheduleOnRN(rightIntent);
          } else {
            scheduleOnRN(swipeRight);
          }
        } else {
          scheduleOnRN(swipeLeft);
        }
      } else {
        translateX.value = withSpring(0, spring);
        translateY.value = withSpring(0, spring);
      }
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
