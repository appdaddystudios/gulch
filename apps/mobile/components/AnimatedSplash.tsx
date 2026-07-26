import { useEffect, useRef } from "react";
import { Animated, StyleSheet } from "react-native";

// Keep the wordmark on screen long enough to read even on instant loads.
const MIN_DISPLAY_MS = 900;
const FADE_MS = 400;
const ZOOM_TO = 1.06;

type AnimatedSplashProps = {
  readonly ready: boolean;
  readonly onDone: () => void;
};

// JS continuation of the native burlap splash (same art, so the handoff is
// seamless): holds briefly, then zooms slightly while fading out.
export function AnimatedSplash({ ready, onDone }: AnimatedSplashProps) {
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const shownAt = useRef(Date.now());

  useEffect(() => {
    if (!ready) {
      return;
    }
    const wait = Math.max(0, MIN_DISPLAY_MS - (Date.now() - shownAt.current));
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, {
          duration: FADE_MS,
          toValue: 0,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          duration: FADE_MS,
          toValue: ZOOM_TO,
          useNativeDriver: true,
        }),
      ]).start(() => onDone());
    }, wait);
    return () => clearTimeout(timer);
  }, [ready, opacity, scale, onDone]);

  return (
    <Animated.Image
      accessibilityIgnoresInvertColors
      source={require("../assets/splash.png")}
      style={[styles.splash, { opacity, transform: [{ scale }] }]}
    />
  );
}

const styles = StyleSheet.create({
  splash: {
    bottom: 0,
    left: 0,
    pointerEvents: "none",
    position: "absolute",
    resizeMode: "cover",
    right: 0,
    top: 0,
    zIndex: 100,
  },
});
