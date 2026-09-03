import { Pressable, StyleSheet, Text, View } from "react-native";

import { ArrowLeftIcon } from "./icons";
import { color, hardShadow, radius, space, type as typePreset } from "../theme";

// Trailing CTA for a Home carousel ("See More Favorites"). Same footprint as
// the compact BannerCard so the row stays aligned; outlined instead of filled
// so it reads as an action, not another item.
type SeeMoreCardProps = {
  readonly label: string;
  readonly onPress: () => void;
  readonly width?: number;
};

const COMPACT_WIDTH = 170;
const ARROW_SIZE = 18;

export function SeeMoreCard({
  label,
  onPress,
  width = COMPACT_WIDTH,
}: SeeMoreCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { width },
        pressed ? styles.pressed : null,
      ]}
    >
      <Text style={styles.label}>{label}</Text>
      {/* The icon set only ships a left arrow; flip it. */}
      <View style={styles.arrow}>
        <ArrowLeftIcon size={ARROW_SIZE} color={color.gulchGreen} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    ...hardShadow,
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: color.darkChocolate,
    borderColor: color.gulchGreen,
    borderRadius: radius.card,
    borderWidth: 2,
    flexDirection: "row",
    gap: space.sm,
    justifyContent: "center",
    padding: space.xl,
  },
  label: {
    ...typePreset.captionBold12,
    color: color.gulchGreen,
  },
  arrow: {
    transform: [{ rotate: "180deg" }],
  },
  pressed: {
    opacity: 0.85,
  },
});
