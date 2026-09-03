import { StyleSheet, Text } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";

import { CloseIcon, HeartIcon } from "./icons";
import { color, radius, space, type as typePreset } from "../theme";

// Reach full opacity halfway to the commit threshold (|progress| = 0.5).
const FULL_AT = 0.5;
// The pill grows from 0.9 to 1 over the same range so it "lands" as the
// user commits, rather than simply appearing.
const SCALE_FROM = 0.9;
const STAMP_ICON = 28;

type SwipeStampsProps = {
  // The deck engine's drag position for this card: 0 centred, ±1 at the
  // swipe threshold (unclamped). Right = favorite, left = skip.
  readonly progress: SharedValue<number>;
};

// FAVORITE / SKIP cues that fade in with the drag, laid over a DeckCard.
// Both stamps sit in the same centred spot; only one is ever visible because
// the interpolations live on opposite sides of 0.
export function SwipeStamps({ progress }: SwipeStampsProps) {
  const favoriteStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, FULL_AT], [0, 1], Extrapolation.CLAMP),
    transform: [
      {
        scale: interpolate(
          progress.value,
          [0, FULL_AT],
          [SCALE_FROM, 1],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));
  const skipStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [-FULL_AT, 0], [1, 0], Extrapolation.CLAMP),
    transform: [
      {
        scale: interpolate(
          progress.value,
          [-FULL_AT, 0],
          [1, SCALE_FROM],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.center]}
    >
      <Animated.View style={[styles.stamp, styles.favorite, favoriteStyle]}>
        <HeartIcon size={STAMP_ICON} color={color.oreo} filled />
        <Text style={styles.label}>FAVORITE</Text>
      </Animated.View>
      <Animated.View style={[styles.stamp, styles.skip, skipStyle]}>
        <CloseIcon size={STAMP_ICON} color={color.oreo} />
        <Text style={styles.label}>SKIP</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
  stamp: {
    alignItems: "center",
    borderColor: color.oreo,
    borderRadius: radius.pill,
    borderWidth: 3,
    flexDirection: "row",
    gap: space.sm,
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
    position: "absolute",
  },
  favorite: {
    backgroundColor: color.gulchGreen,
  },
  skip: {
    backgroundColor: color.khakis,
  },
  label: {
    ...typePreset.h24Bold,
    color: color.oreo,
    letterSpacing: 1,
  },
});
