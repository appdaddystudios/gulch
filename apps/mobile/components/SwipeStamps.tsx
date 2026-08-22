import { StyleSheet, Text } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";

import { color, radius, space, type as typePreset } from "../theme";

// Reach full opacity halfway to the commit threshold (|progress| = 0.5).
const FULL_AT = 0.5;

type SwipeStampsProps = {
  // The deck engine's drag position for this card: 0 centred, ±1 at the
  // swipe threshold (unclamped). Right = save, left = skip.
  readonly progress: SharedValue<number>;
};

// SAVE / SKIP cues that fade in with the drag, laid over a DeckCard.
export function SwipeStamps({ progress }: SwipeStampsProps) {
  const saveStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, FULL_AT], [0, 1], Extrapolation.CLAMP),
  }));
  const skipStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [-FULL_AT, 0], [1, 0], Extrapolation.CLAMP),
  }));

  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[styles.stamp, styles.save, saveStyle]}
      >
        <Text style={styles.label}>SAVE</Text>
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[styles.stamp, styles.skip, skipStyle]}
      >
        <Text style={styles.label}>SKIP</Text>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  stamp: {
    borderColor: color.oreo,
    borderRadius: radius.pill,
    borderWidth: 2,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    position: "absolute",
    top: space.xl,
  },
  save: {
    backgroundColor: color.gulchGreen,
    left: space.xl,
    transform: [{ rotate: "-12deg" }],
  },
  skip: {
    backgroundColor: color.khakis,
    right: space.xl,
    transform: [{ rotate: "12deg" }],
  },
  label: {
    ...typePreset.bodyBold14,
    color: color.oreo,
    letterSpacing: 1,
  },
});
