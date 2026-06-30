import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ArrowLeftIcon, GulchLogo } from "./icons";
import { color, headerShadow, space } from "../theme";

const BAR_HEIGHT = 60;
const LOGO_SLOT = 18;
const BACK_SIZE = 24;

type HeaderProps = {
  readonly showBack?: boolean;
  readonly onBack?: () => void;
  readonly showLogo?: boolean;
  readonly rightAction?: ReactNode;
};

export function Header({
  showBack = false,
  onBack,
  showLogo = true,
  rightAction,
}: HeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        {showBack ? (
          <Pressable
            accessibilityLabel="Go back"
            accessibilityRole="button"
            hitSlop={8}
            onPress={onBack}
          >
            <ArrowLeftIcon size={BACK_SIZE} color={color.khakis} />
          </Pressable>
        ) : (
          <View style={styles.logoSlot} />
        )}

        {showLogo ? <GulchLogo width={198} height={24} /> : <View style={styles.spacer} />}

        {rightAction ? (
          <View style={styles.rightGroup}>{rightAction}</View>
        ) : (
          <View style={styles.logoSlot} />
        )}
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
  logoSlot: {
    alignItems: "center",
    height: LOGO_SLOT,
    justifyContent: "center",
    width: LOGO_SLOT,
  },
  spacer: {
    flex: 1,
  },
  rightGroup: {
    alignItems: "center",
    flexDirection: "row",
    gap: space.xl,
  },
});
