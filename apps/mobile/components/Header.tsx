import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ArrowLeftIcon, GulchLogo } from "./icons";
import { color, headerShadow, space } from "../theme";

const BAR_HEIGHT = 60;
const SLOT_SIZE = 18;

type HeaderProps = {
  readonly showBack?: boolean;
  readonly onBack?: () => void;
  readonly rightAction?: ReactNode;
};

export function Header({ showBack = false, onBack, rightAction }: HeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <View style={styles.slot}>
          {showBack ? (
            <Pressable
              accessibilityLabel="Go back"
              accessibilityRole="button"
              onPress={onBack}
            >
              <ArrowLeftIcon size={SLOT_SIZE} color={color.khakis} />
            </Pressable>
          ) : null}
        </View>
        <GulchLogo width={198} height={24} />
        <View style={styles.slot}>{rightAction}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...headerShadow,
    backgroundColor: color.darkChocolate,
    zIndex: 1,
  },
  bar: {
    alignItems: "center",
    flexDirection: "row",
    height: BAR_HEIGHT,
    justifyContent: "space-between",
    paddingHorizontal: space.xl,
  },
  slot: {
    alignItems: "center",
    height: SLOT_SIZE,
    justifyContent: "center",
    width: SLOT_SIZE,
  },
});
