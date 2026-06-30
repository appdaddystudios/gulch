import type { ComponentType } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  CalendarIcon,
  HomeIcon,
  type IconProps,
  LineupIcon,
  MapIcon,
  NewsletterIcon,
} from "./icons";
import { color, space, type as typePreset } from "../theme";

type TabConfig = {
  readonly label: string;
  readonly Icon: ComponentType<IconProps>;
};

// Keyed by the route (file) name in app/(tabs).
const TAB_CONFIG: Record<string, TabConfig> = {
  index: { label: "Home", Icon: HomeIcon },
  calendar: { label: "Calendar", Icon: CalendarIcon },
  map: { label: "Map", Icon: MapIcon },
  lineup: { label: "Lineup", Icon: LineupIcon },
  newsletter: { label: "Newsletter", Icon: NewsletterIcon },
};

// Structural subset of the navigator's tab-bar props (decoupled from the
// react-navigation version that expo-router vendors).
type TabBarProps = {
  readonly state: {
    readonly index: number;
    readonly routes: ReadonlyArray<{
      readonly key: string;
      readonly name: string;
    }>;
  };
  readonly navigation: {
    readonly navigate: (name: string) => void;
    readonly emit: (event: {
      readonly type: "tabPress";
      readonly target: string;
      readonly canPreventDefault: true;
    }) => { readonly defaultPrevented: boolean };
  };
};

export function TabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        { paddingBottom: Math.max(insets.bottom, space.md) },
      ]}
    >
      <View style={styles.row}>
        {state.routes.map((route, index) => {
          const config = TAB_CONFIG[route.name];
          if (!config) {
            return null;
          }

          const isFocused = state.index === index;
          const tint = isFocused ? color.gulchGreen : color.khakis;
          const { Icon } = config;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: isFocused }}
              key={route.key}
              onPress={onPress}
              style={styles.item}
            >
              <Icon size={24} color={tint} />
              <Text style={[styles.label, { color: tint }]} numberOfLines={1}>
                {config.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: color.darkChocolate,
    borderTopColor: color.oreo,
    borderTopWidth: 1,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: space.xl,
    paddingTop: 7,
  },
  item: {
    alignItems: "center",
    gap: space.xs,
    width: 52,
  },
  label: {
    ...typePreset.label10Medium,
    textAlign: "center",
  },
});
