import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

import { CheckIcon } from "./icons";
import { color, hardShadow, radius, space, type as typePreset } from "../theme";

const SHOW_MS = 2000;
const FADE_MS = 200;
const CHECK_CIRCLE = 24;

type ToastProps = {
  readonly message: string;
  readonly visible: boolean;
  readonly onDismiss: () => void;
};

// Top-anchored confirmation toast (V3 Event Details "Added to your favorites").
// Fades in under the header, holds, then fades out and reports dismissal.
export function Toast({ message, visible, onDismiss }: ToastProps) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      return;
    }
    Animated.timing(opacity, {
      duration: FADE_MS,
      toValue: 1,
      useNativeDriver: true,
    }).start();
    const timer = setTimeout(() => {
      Animated.timing(opacity, {
        duration: FADE_MS,
        toValue: 0,
        useNativeDriver: true,
      }).start(() => onDismiss());
    }, SHOW_MS);
    return () => clearTimeout(timer);
  }, [visible, opacity, onDismiss]);

  if (!visible) {
    return null;
  }

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      pointerEvents="none"
      style={[styles.toast, { opacity }]}
    >
      <View style={styles.checkCircle}>
        <CheckIcon size={14} color={color.white} />
      </View>
      <Text style={styles.label}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    ...hardShadow,
    alignItems: "center",
    backgroundColor: color.brown100,
    borderRadius: radius.card,
    flexDirection: "row",
    gap: space.lg,
    left: space.md,
    paddingHorizontal: space.xl,
    paddingVertical: space.xl,
    position: "absolute",
    right: space.md,
    top: space.md,
    zIndex: 10,
  },
  checkCircle: {
    alignItems: "center",
    backgroundColor: color.oreo,
    borderRadius: CHECK_CIRCLE / 2,
    height: CHECK_CIRCLE,
    justifyContent: "center",
    width: CHECK_CIRCLE,
  },
  label: {
    ...typePreset.bodyBold14,
    color: color.oreo,
  },
});
