import type { ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from "react-native";

import { radius, space, type as typePreset, color } from "../theme";

type ButtonSize = "s" | "m" | "l";
type ButtonTone = "primary" | "beige" | "accent" | "outline" | "light" | "dark";

type ButtonProps = {
  readonly label: string;
  readonly onPress?: () => void;
  readonly size?: ButtonSize;
  readonly tone?: ButtonTone;
  readonly fullWidth?: boolean;
  readonly leftIcon?: ReactNode;
  readonly disabled?: boolean;
};

const sizeStyles: Record<
  ButtonSize,
  {
    height: number;
    paddingHorizontal: number;
    text: TextStyle;
  }
> = {
  s: {
    height: 32,
    paddingHorizontal: space.lg,
    text: typePreset.captionMedium12,
  },
  m: { height: 40, paddingHorizontal: space.xl, text: typePreset.bodyBold14 },
  l: { height: 48, paddingHorizontal: space.xxl, text: typePreset.body16 },
};

const toneStyles: Record<
  ButtonTone,
  { background: string; foreground: string; border?: string }
> = {
  primary: { background: color.oreo, foreground: color.gulchGreen },
  beige: { background: color.beige300, foreground: color.oreo },
  accent: { background: color.latte, foreground: color.white },
  outline: {
    background: "transparent",
    foreground: color.white,
    border: color.white,
  },
  light: { background: color.white, foreground: color.oreo },
  dark: { background: color.oreo, foreground: color.white },
};

export function Button({
  label,
  onPress,
  size = "m",
  tone = "primary",
  fullWidth = false,
  leftIcon,
  disabled = false,
}: ButtonProps) {
  const sizing = sizeStyles[size];
  const colors = toneStyles[tone];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          height: sizing.height,
          paddingHorizontal: sizing.paddingHorizontal,
          backgroundColor: colors.background,
        },
        colors.border ? { borderColor: colors.border, borderWidth: 2 } : null,
        fullWidth && styles.fullWidth,
        (pressed || disabled) && styles.dimmed,
      ]}
    >
      {leftIcon ? <View style={styles.icon}>{leftIcon}</View> : null}
      <Text
        style={[sizing.text, { color: colors.foreground }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    borderRadius: radius.pill,
    flexDirection: "row",
    gap: space.sm,
    justifyContent: "center",
    overflow: "hidden",
  },
  fullWidth: {
    alignSelf: "stretch",
    width: "100%",
  },
  icon: {
    alignItems: "center",
    justifyContent: "center",
  },
  dimmed: {
    opacity: 0.7,
  },
});

export type { ButtonSize, ButtonTone };
