import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  CalendarFilledIcon,
  CalendarIcon,
  GulchGCircleIcon,
  HeartIcon,
  MapFilledIcon,
  MapIcon,
  NewsletterIcon,
} from "./icons";
import { color, space, type as typePreset } from "../theme";

type TabConfig = {
  readonly label: string;
  // Focused tabs render their filled/colored variant; unfocused take the tint.
  readonly renderIcon: (focused: boolean, tint: string) => ReactNode;
};

// Keyed by the route (file) name in app/(tabs).
const TAB_CONFIG: Record<string, TabConfig> = {
  index: {
    label: "Home",
    renderIcon: (focused) => <GulchGCircleIcon size={24} selected={focused} />,
  },
  calendar: {
    label: "Calendar",
    renderIcon: (focused, tint) =>
      focused ? (
        <CalendarFilledIcon size={24} />
      ) : (
        <CalendarIcon size={24} color={tint} />
      ),
  },
  map: {
    label: "Map",
    renderIcon: (focused, tint) =>
      focused ? <MapFilledIcon size={24} /> : <MapIcon size={24} color={tint} />,
  },
  favorites: {
    label: "Favorites",
    renderIcon: (focused, tint) => (
      <HeartIcon size={24} color={tint} filled={focused} />
    ),
  },
  newsletter: {
    // No filled asset exists — the outline keeps the tint when selected.
    label: "Newsletter",
    renderIcon: (_focused, tint) => <NewsletterIcon size={24} color={tint} />,
  },
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
              {config.renderIcon(isFocused, tint)}
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
    ...typePreset.tabLabel,
    textAlign: "center",
  },
});
