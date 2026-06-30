import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { color, hardShadow, radius, space, type as typePreset } from "../theme";

// Compact card used in the Home horizontal carousels (Your Events, Featured
// Organizations, Trending, Recently Viewed).
type BannerCardProps = {
  readonly title: string;
  readonly subtitle?: string;
  readonly onPress?: () => void;
  readonly width?: number;
  readonly height?: number;
};

const COMPACT_WIDTH = 170;

export function BannerCard({
  title,
  subtitle,
  onPress,
  width = COMPACT_WIDTH,
  height,
}: BannerCardProps) {
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.compact,
        { width },
        height ? { height } : null,
        pressed && onPress ? styles.pressed : null,
      ]}
    >
      <View style={styles.compactContent}>
        <Text style={styles.compactTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.compactSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

// Full-width promotional banner (Banner Ad, Hotspots Map, Participate in Research).
type PromoBannerTone = "dark" | "light";

type PromoBannerProps = {
  readonly title: string;
  readonly body?: string;
  readonly tone?: PromoBannerTone;
  readonly action?: ReactNode;
  readonly minHeight?: number;
};

export function PromoBanner({
  title,
  body,
  tone = "dark",
  action,
  minHeight,
}: PromoBannerProps) {
  const isLight = tone === "light";
  const textColor = isLight ? color.darkChocolate : color.white;

  return (
    <View
      style={[
        styles.promo,
        { backgroundColor: isLight ? color.brown100 : color.brown400 },
        minHeight ? { minHeight } : null,
      ]}
    >
      <View style={styles.promoContent}>
        <View style={styles.promoText}>
          <Text style={[styles.promoTitle, { color: textColor }]}>{title}</Text>
          {body ? (
            <Text style={[styles.promoBody, { color: textColor }]}>{body}</Text>
          ) : null}
        </View>
        {action ? <View>{action}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  compact: {
    ...hardShadow,
    backgroundColor: color.brown300,
    borderColor: color.oreo,
    borderRadius: radius.card,
    borderWidth: 2,
    justifyContent: "center",
    padding: space.xl,
  },
  compactContent: {
    alignItems: "flex-start",
  },
  compactTitle: {
    ...typePreset.bodyBold14,
    color: color.white,
    width: "100%",
  },
  compactSubtitle: {
    ...typePreset.caption12,
    color: color.white,
    width: "100%",
  },
  pressed: {
    opacity: 0.85,
  },
  promo: {
    ...hardShadow,
    borderColor: color.oreo,
    borderRadius: radius.card,
    borderWidth: 2,
    justifyContent: "center",
    paddingBottom: space.xxl,
    paddingLeft: space.xl,
    paddingRight: space.xxl,
    paddingTop: space.xxl,
    width: "100%",
  },
  promoContent: {
    alignItems: "flex-start",
    gap: space.lg,
  },
  promoText: {
    gap: space.xs,
    width: "100%",
  },
  promoTitle: {
    ...typePreset.h24Bold,
  },
  promoBody: {
    ...typePreset.body16,
  },
});

export type { PromoBannerTone };
