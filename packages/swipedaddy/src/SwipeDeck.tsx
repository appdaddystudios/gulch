import { useCallback, useImperativeHandle, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useAnimatedReaction, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { DEFAULT_CONFIG } from './defaults';
import { SwipeableCard } from './SwipeableCard';
import { useCardRefs } from './use-swipe-controls';
import type { SwipeDeckProps, SwipeDeckRef } from './types';
import type { Ref } from 'react';

/**
 * Headless swipeable card deck. Bring your own card UI via `renderCard`;
 * drive it by gesture or through the ref (buttons). See SwipeDeckProps.
 */
export function SwipeDeck<T>(
  props: SwipeDeckProps<T> & { ref?: Ref<SwipeDeckRef> },
) {
  const {
    data,
    renderCard,
    keyExtractor,
    onSwipeLeft,
    onSwipeRight,
    onSwipeRightIntent,
    onCardPress,
    onActiveIndexChange,
    onDeckEnd,
    config: configOverrides,
    cardStyle,
    ref,
  } = props;

  const activeIndex = useSharedValue(0);
  const config = useMemo(
    () => ({ ...DEFAULT_CONFIG, ...configOverrides }),
    [configOverrides],
  );
  const { refs, resetCards } = useCardRefs(data.length);

  const reset = useCallback(() => {
    activeIndex.value = 0;
    resetCards();
  }, [activeIndex, resetCards]);

  const swipeLeft = useCallback(() => {
    refs[Math.floor(activeIndex.value)]?.current?.swipeLeft();
  }, [activeIndex, refs]);

  const swipeRight = useCallback(() => {
    refs[Math.floor(activeIndex.value)]?.current?.swipeRight();
  }, [activeIndex, refs]);

  const hint = useCallback(() => {
    return refs[Math.floor(activeIndex.value)]?.current?.hint() ?? false;
  }, [activeIndex, refs]);

  useImperativeHandle(ref, () => {
    return {
      swipeLeft,
      swipeRight,
      reset,
      hint,
      activeIndex,
    };
  }, [swipeLeft, swipeRight, reset, hint, activeIndex]);

  const count = data.length;
  useAnimatedReaction(
    () => Math.floor(activeIndex.value),
    (current, previous) => {
      if (previous === null || current === previous) return;
      if (onActiveIndexChange) {
        scheduleOnRN(onActiveIndexChange, current);
      }
      if (current >= count && onDeckEnd) {
        scheduleOnRN(onDeckEnd);
      }
    },
    [count, onActiveIndexChange, onDeckEnd],
  );

  return (
    <View style={styles.container}>
      {data.map((item, index) => (
        <SwipeableCard
          key={keyExtractor ? keyExtractor(item, index) : index}
          index={index}
          activeIndex={activeIndex}
          config={config}
          cardStyle={cardStyle}
          ref={refs[index]}
          onSwipeLeft={onSwipeLeft ? () => onSwipeLeft(item, index) : undefined}
          onSwipeRight={
            onSwipeRight ? () => onSwipeRight(item, index) : undefined
          }
          onSwipeRightIntent={
            onSwipeRightIntent
              ? () => onSwipeRightIntent(item, index)
              : undefined
          }
          onPress={onCardPress ? () => onCardPress(item, index) : undefined}
          renderContent={progress => renderCard(item, index, progress)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
