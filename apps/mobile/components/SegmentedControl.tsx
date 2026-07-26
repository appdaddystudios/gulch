import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { color, radius, space, type as typePreset } from "../theme";

type Segment<K extends string> = {
  readonly key: K;
  readonly label: string;
  readonly renderIcon?: (active: boolean) => ReactNode;
};

type SegmentedControlProps<K extends string> = {
  readonly segments: ReadonlyArray<Segment<K>>;
  readonly value: K;
  readonly onChange: (key: K) => void;
};

// V3 Month | Week | List switcher — outlined pill container, the active
// segment gets a darker filled pill.
export function SegmentedControl<K extends string>({
  segments,
  value,
  onChange,
}: SegmentedControlProps<K>) {
  return (
    <View style={styles.container}>
      {segments.map((segment) => {
        const active = segment.key === value;
        return (
          <Pressable
            key={segment.key}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(segment.key)}
            style={[styles.segment, active ? styles.segmentActive : null]}
          >
            {segment.renderIcon ? segment.renderIcon(active) : null}
            <Text style={[styles.label, active ? styles.labelActive : null]}>
              {segment.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: color.darkChocolate,
    borderColor: color.oreo,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    flexDirection: "row",
    padding: space.xs,
  },
  segment: {
    alignItems: "center",
    borderRadius: radius.pill,
    flexDirection: "row",
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  segmentActive: {
    backgroundColor: color.oreo,
  },
  label: {
    ...typePreset.captionMedium12,
    color: color.khakis,
  },
  labelActive: {
    color: color.white,
  },
});
