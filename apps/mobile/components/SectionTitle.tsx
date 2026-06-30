import { StyleSheet, Text } from "react-native";

import { color, type as typePreset } from "../theme";

type SectionTitleProps = {
  readonly children: string;
};

export function SectionTitle({ children }: SectionTitleProps) {
  return <Text style={styles.title}>{children}</Text>;
}

const styles = StyleSheet.create({
  title: {
    ...typePreset.h24Bold,
    color: color.white,
  },
});
