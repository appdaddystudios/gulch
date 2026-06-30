import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { CheckVerifiedIcon } from "./icons";
import { color, radius, space, type as typePreset } from "../theme";

type BadgeVariant = "editorsPick" | "solid";

type BadgeProps = {
  readonly label: string;
  readonly variant?: BadgeVariant;
  readonly icon?: ReactNode;
};

export function Badge({ label, variant = "editorsPick", icon }: BadgeProps) {
  const isEditorsPick = variant === "editorsPick";
  const leadingIcon =
    icon ?? (isEditorsPick ? <CheckVerifiedIcon size={12} color={color.gulchGreen} /> : null);

  return (
    <View style={[styles.base, isEditorsPick ? styles.editorsPick : styles.solid]}>
      {leadingIcon ? <View style={styles.icon}>{leadingIcon}</View> : null}
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    flexDirection: "row",
    gap: space.xs,
    justifyContent: "center",
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  editorsPick: {
    backgroundColor: color.latte,
    borderColor: color.brown300,
    borderWidth: 1,
    // Hard offset shadow (2px 2px 0 #93684B).
    shadowColor: color.brown300,
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 2,
  },
  solid: {
    backgroundColor: color.oreo,
  },
  icon: {
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    ...typePreset.label10Medium,
    color: color.white,
  },
});

export type { BadgeVariant };
