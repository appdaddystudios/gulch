import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { color, space, type as typePreset } from "../theme";

type EmptyStateProps = {
  readonly title: string;
  readonly subtitle?: string;
  readonly icon?: ReactNode;
};

export function EmptyState({ title, subtitle, icon }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
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
});
