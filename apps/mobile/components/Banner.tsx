import type { ReactNode } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { TwoDotText } from "./TwoDotText";
import type { BannerAd } from "../lib/homeConfig";
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
        <TwoDotText text={title} style={styles.compactTitle} />
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
  // Makes the whole card tappable (the action button still works on its own).
  readonly onPress?: () => void;
};

export function PromoBanner({
  title,
  body,
  tone = "dark",
  action,
  minHeight,
  onPress,
}: PromoBannerProps) {
  const isLight = tone === "light";
  const textColor = isLight ? color.darkChocolate : color.white;

  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={onPress ? title : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.promo,
        { backgroundColor: isLight ? color.brown100 : color.brown400 },
        minHeight ? { minHeight } : null,
        pressed && onPress ? styles.pressed : null,
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
    </Pressable>
  );
}

// Admin-configured homepage ad. Text mode reuses PromoBanner; image mode shows
// the uploaded art letterboxed on the brand background (never cropped).
type BannerAdSlotProps = {
  readonly ad: BannerAd;
  readonly onPress?: () => void;
};

export function BannerAdSlot({ ad, onPress }: BannerAdSlotProps) {
  if (ad.kind === "text") {
    return (
      <PromoBanner
        title={ad.title}
        body={ad.body ?? undefined}
        tone="dark"
        onPress={onPress}
      />
    );
  }

  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel="Banner ad"
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.adImageWrap,
        pressed && onPress ? styles.pressed : null,
      ]}
    >
      <Image
        accessibilityIgnoresInvertColors
        source={{ uri: ad.imageUrl }}
        resizeMode="contain"
        style={styles.adImage}
      />
    </Pressable>
  );
}

const AD_ASPECT_RATIO = 2;

const styles = StyleSheet.create({
  adImageWrap: {
    ...hardShadow,
    aspectRatio: AD_ASPECT_RATIO,
    backgroundColor: color.oreo,
    borderColor: color.oreo,
    borderRadius: radius.card,
    borderWidth: 2,
    overflow: "hidden",
    width: "100%",
  },
  adImage: {
    height: "100%",
    width: "100%",
  },
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
    ...typePreset.captionBold12,
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
