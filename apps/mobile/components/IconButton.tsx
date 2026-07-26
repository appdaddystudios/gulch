import type { ReactNode } from "react";
import { Pressable, StyleSheet } from "react-native";

import { color } from "../theme";

const DEFAULT_SIZE = 44;

type IconButtonProps = {
  readonly accessibilityLabel: string;
  readonly onPress?: () => void;
  readonly children: ReactNode;
  readonly size?: number;
  readonly selected?: boolean;
  readonly disabled?: boolean;
};

// Circular outlined icon button — V3 uses it for the header/control-bar search,
// day-stepper arrows, and month navigation.
export function IconButton({
  accessibilityLabel,
  onPress,
  children,
  size = DEFAULT_SIZE,
  selected = false,
  disabled = false,
}: IconButtonProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { borderRadius: size / 2, height: size, width: size },
        pressed ? styles.pressed : null,
      ]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    backgroundColor: color.darkChocolate,
    borderColor: color.oreo,
    borderWidth: 1.5,
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.8,
  },
});
