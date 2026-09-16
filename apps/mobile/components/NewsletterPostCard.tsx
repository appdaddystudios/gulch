import { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { GulchLogo } from "./icons";
import { formatPostDate } from "../lib/format";
import type { NewsletterPost } from "../lib/newsletterFeed";
import {
  color,
  font,
  hardShadow,
  radius,
  space,
  type as typePreset,
} from "../theme";

const COVER_ASPECT_RATIO = 16 / 9;
// Inner radius sits inside the 2px card border.
const COVER_RADIUS = radius.card - 2;

type NewsletterPostCardProps = {
  readonly post: NewsletterPost;
  readonly onPress: () => void;
};

export function NewsletterPostCard({ post, onPress }: NewsletterPostCardProps) {
  const [coverFailed, setCoverFailed] = useState(false);
  const hasCover = Boolean(post.coverUrl) && !coverFailed;
  const dateLabel = formatPostDate(post.publishedAt);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed ? styles.pressed : null]}
    >
      {hasCover ? (
        <Image
          accessibilityIgnoresInvertColors
          onError={() => setCoverFailed(true)}
          resizeMode="cover"
          source={{ uri: post.coverUrl as string }}
          style={styles.cover}
        />
      ) : (
        <View style={styles.coverPlaceholder}>
          <GulchLogo width={120} height={15} />
        </View>
      )}

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {post.title}
        </Text>
        {post.subtitle ? (
          <Text style={styles.subtitle} numberOfLines={2}>
            {post.subtitle}
          </Text>
        ) : null}
        {dateLabel ? <Text style={styles.date}>{dateLabel}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    ...hardShadow,
    backgroundColor: color.brown400,
    borderColor: color.oreo,
    borderRadius: radius.card,
    borderWidth: 2,
    width: "100%",
  },
  pressed: {
    opacity: 0.85,
  },
  cover: {
    aspectRatio: COVER_ASPECT_RATIO,
    backgroundColor: color.oreo,
    borderTopLeftRadius: COVER_RADIUS,
    borderTopRightRadius: COVER_RADIUS,
    width: "100%",
  },
  coverPlaceholder: {
    alignItems: "center",
    aspectRatio: COVER_ASPECT_RATIO,
    backgroundColor: color.gulchGreen,
    borderTopLeftRadius: COVER_RADIUS,
    borderTopRightRadius: COVER_RADIUS,
    justifyContent: "center",
    width: "100%",
  },
  body: {
    gap: space.xs,
    padding: space.xl,
  },
  title: {
    ...typePreset.body16,
    color: color.white,
    fontFamily: font.bold,
  },
  subtitle: {
    color: color.khakis,
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 21,
  },
  date: {
    ...typePreset.caption12,
    color: color.beige300,
    marginTop: space.xs,
  },
});
