import { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { Badge } from "./Badge";
import { GulchLogo, HeartIcon, MailIcon } from "./icons";
import {
  EVENT_CARD_BORDER,
  EVENT_CARD_PILL_MIN_HEIGHT,
  EVENT_HERO_ASPECT,
  eventCardLabel,
  eventMetaLabel,
  eventStatusLabel,
  eventTimeLabel,
} from "../lib/eventCard";
import type { EventListItem } from "../lib/events";
import {
  color,
  font,
  hardShadow,
  radius,
  space,
  type as typePreset,
} from "../theme";

const HEART_SIZE = 44;
// Hero corners sit inside the card border.
const HERO_RADIUS = radius.card - EVENT_CARD_BORDER;

type EventCardProps = {
  readonly event: EventListItem;
  readonly onPress?: () => void;
  readonly saved?: boolean;
  readonly onToggleSave?: () => void;
  // Deck face: the card fills the slot the engine gives it and shows no
  // heart, since swiping right is the save gesture there.
  readonly fill?: boolean;
};

// The one event card: NewsletterPostCard chrome (brown surface, 2px border,
// hard shadow), a 4:3 hero with the save heart floating top-right, then the
// time pill, name, organizer-or-venue line, and the status row.
export function EventCard({
  event,
  onPress,
  saved = false,
  onToggleSave,
  fill = false,
}: EventCardProps) {
  const [imageFailed, setImageFailed] = useState(false);
  // Any stored image renders — a transient pipeline status ("pending"/"failed"
  // after a re-mark) must not hide a previously good rehosted image.
  const hasImage = Boolean(event.imageUrl) && !imageFailed;
  const timeLabel = eventTimeLabel(event);
  const metaLabel = eventMetaLabel(event);
  const status = eventStatusLabel(event);

  return (
    <Pressable
      accessibilityLabel={eventCardLabel(event)}
      accessibilityRole={onPress ? "button" : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        fill ? styles.fill : null,
        pressed && onPress ? styles.pressed : null,
      ]}
    >
      <View style={styles.hero}>
        {hasImage ? (
          <Image
            accessibilityIgnoresInvertColors
            onError={() => setImageFailed(true)}
            resizeMode="cover"
            source={{ uri: event.imageUrl as string }}
            style={styles.image}
          />
        ) : (
          <View style={styles.placeholder}>
            <GulchLogo width={120} height={15} />
          </View>
        )}
        {fill ? null : (
          <Pressable
            accessibilityLabel={saved ? "Remove from saved" : "Save event"}
            accessibilityRole="button"
            accessibilityState={{ selected: saved }}
            disabled={!onToggleSave}
            hitSlop={6}
            onPress={onToggleSave}
            style={styles.heart}
          >
            <HeartIcon
              size={24}
              color={saved ? color.gulchGreen : color.white}
              filled={saved}
            />
          </Pressable>
        )}
      </View>

      <View style={[styles.panel, fill ? styles.fill : null]}>
        {timeLabel ? (
          <View style={styles.timePill}>
            <Text style={styles.timeLabel} numberOfLines={1}>
              {timeLabel}
            </Text>
          </View>
        ) : null}

        <Text style={styles.name} numberOfLines={2}>
          {event.name}
        </Text>
        {metaLabel ? (
          <Text style={styles.meta} numberOfLines={1}>
            {metaLabel}
          </Text>
        ) : null}

        {status === "Editor's Pick" ? (
          <Badge label={status} variant="editorsPick" />
        ) : status === "RSVP Required" ? (
          <View style={styles.statusRow}>
            <MailIcon size={16} color={color.khakis} />
            <Text style={styles.statusLabel}>{status}</Text>
          </View>
        ) : status === "Sponsored" ? (
          <Text style={styles.sponsored}>{status}</Text>
        ) : null}
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
    borderWidth: EVENT_CARD_BORDER,
    width: "100%",
  },
  fill: {
    flex: 1,
  },
  pressed: {
    opacity: 0.85,
  },
  hero: {
    aspectRatio: EVENT_HERO_ASPECT,
    backgroundColor: color.oreo,
    borderTopLeftRadius: HERO_RADIUS,
    borderTopRightRadius: HERO_RADIUS,
    overflow: "hidden",
    width: "100%",
  },
  image: {
    height: "100%",
    width: "100%",
  },
  placeholder: {
    alignItems: "center",
    height: "100%",
    backgroundColor: color.gulchGreen,
    justifyContent: "center",
    width: "100%",
  },
  heart: {
    alignItems: "center",
    backgroundColor: color.darkChocolate,
    borderRadius: HEART_SIZE / 2,
    height: HEART_SIZE,
    justifyContent: "center",
    position: "absolute",
    right: space.md,
    top: space.md,
    width: HEART_SIZE,
  },
  panel: {
    gap: space.xs,
    padding: space.xl,
  },
  timePill: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: color.darkChocolate,
    borderRadius: radius.pill,
    justifyContent: "center",
    // Grows with the label under larger system text.
    minHeight: EVENT_CARD_PILL_MIN_HEIGHT,
    paddingHorizontal: space.md,
    paddingVertical: space.xxs,
  },
  timeLabel: {
    ...typePreset.label10Medium,
    color: color.khakis,
    // Centered in the fixed-height pill: the preset's lineHeight bottom-aligns
    // text on iOS (same behavior as the SearchBar fix).
    includeFontPadding: false,
    lineHeight: undefined,
  },
  name: {
    ...typePreset.body16,
    color: color.white,
    fontFamily: font.bold,
  },
  meta: {
    color: color.khakis,
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 21,
  },
  statusRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: space.xs,
  },
  statusLabel: {
    ...typePreset.label10Regular,
    color: color.khakis,
  },
  sponsored: {
    ...typePreset.label10Regular,
    color: color.beige300,
  },
});
