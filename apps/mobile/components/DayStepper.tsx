import { StyleSheet, Text, View } from "react-native";

import { IconButton } from "./IconButton";
import { ArrowLeftIcon } from "./icons";
import { color, space, type as typePreset } from "../theme";

type DayStepperProps = {
  readonly label: string;
  readonly onPrev: () => void;
  readonly onNext: () => void;
};

// V3 selected-day header — "Friday, July 11, 2026" flanked by circular
// prev/next arrows (right arrow is the left glyph mirrored).
export function DayStepper({ label, onPrev, onNext }: DayStepperProps) {
  return (
    <View style={styles.row}>
      <IconButton accessibilityLabel="Previous day" onPress={onPrev}>
        <ArrowLeftIcon size={18} color={color.khakis} />
      </IconButton>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      <IconButton accessibilityLabel="Next day" onPress={onNext}>
        <View style={styles.mirrored}>
          <ArrowLeftIcon size={18} color={color.khakis} />
        </View>
      </IconButton>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: space.md,
    justifyContent: "space-between",
    paddingVertical: space.md,
  },
  label: {
    ...typePreset.h24Bold,
    color: color.white,
    flexShrink: 1,
    fontSize: 20,
    lineHeight: 26,
    textAlign: "center",
  },
  mirrored: {
    transform: [{ scaleX: -1 }],
  },
});
