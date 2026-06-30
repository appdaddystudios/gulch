import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { color, space, type as typePreset } from "../theme";

type EmptyStateProps = {
  readonly title: string;
  readonly subtitle?: string;
  readonly icon?: ReactNode;
  readonly action?: ReactNode;
  // "top" pins the block near the top of its area (V2 no-results state);
  // "center" (default) lets a flex parent center it vertically.
  readonly align?: "center" | "top";
};

export function EmptyState({
  title,
  subtitle,
  icon,
  action,
  align = "center",
}: EmptyStateProps) {
  return (
    <View style={[styles.container, align === "top" ? styles.top : null]}>
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: space.md,
    justifyContent: "center",
    paddingHorizontal: space.xxl,
    paddingVertical: space.huge,
  },
  top: {
    flex: 1,
    justifyContent: "flex-start",
    paddingTop: space.xxl,
  },
  icon: {
    marginBottom: space.md,
  },
  title: {
    ...typePreset.h24Bold,
    color: color.white,
    textAlign: "center",
  },
  subtitle: {
    ...typePreset.body16,
    color: color.khakis,
    textAlign: "center",
  },
  action: {
    marginTop: space.lg,
  },
});
