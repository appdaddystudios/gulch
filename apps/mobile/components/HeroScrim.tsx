import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

// Bottom-weighted scrim laid over hero imagery so light text stays legible.
// One definition shared by Event Details and the Home deck cards.
const SCRIM_COLORS = ["rgba(0,0,0,0)", "rgba(0,0,0,0.1)", "rgba(0,0,0,0.8)"] as const;
const SCRIM_LOCATIONS = [0, 0.7, 1] as const;

type HeroScrimProps = {
  readonly style?: StyleProp<ViewStyle>;
};

export function HeroScrim({ style }: HeroScrimProps) {
  return (
    <LinearGradient
      colors={SCRIM_COLORS}
      locations={SCRIM_LOCATIONS}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, style]}
    />
  );
}
