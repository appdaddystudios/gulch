import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { Badge } from "./Badge";
import { GulchLogo, HeartIcon, MailIcon } from "./icons";
import type { EventListItem } from "../lib/events";
import { formatEventTimeCompact } from "../lib/format";
import { color, radius, space, type as typePreset } from "../theme";

const IMAGE_SIZE = 104;
const BOOKMARK_SIZE = 44;

type EventCardProps = {
  readonly event: EventListItem;
  readonly onPress?: () => void;
  readonly editorsPick?: boolean;
  readonly sponsored?: boolean;
  readonly saved?: boolean;
  readonly onToggleSave?: () => void;
};

export function EventCard({
  event,
  onPress,
  editorsPick = false,
  sponsored = false,
  saved = false,
  onToggleSave,
}: EventCardProps) {
  const hasImage = event.imageStatus === "ok" && Boolean(event.imageUrl);
  const timeLabel = formatEventTimeCompact(event.startAt, {
    endAt: event.endAt,
    customTimeDescription: event.customTimeDescription,
  });

  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        pressed && onPress ? styles.pressed : null,
      ]}
    >
      <View style={styles.imageWrapper}>
        {hasImage ? (
          <Image
            accessibilityIgnoresInvertColors
            source={{ uri: event.imageUrl as string }}
            style={styles.image}
          />
        ) : (
          <View style={styles.placeholder}>
            <GulchLogo width={72} height={9} />
          </View>
        )}
      </View>

      <View style={styles.content}>
        {timeLabel ? (
          <View style={styles.timePill}>
            <Text style={styles.timeLabel} numberOfLines={1}>
              {timeLabel}
            </Text>
          </View>
        ) : null}

        <View style={styles.nameBlock}>
          <Text style={styles.name} numberOfLines={2}>
            {event.name}
          </Text>
          {event.organizerName ? (
            <Text style={styles.meta} numberOfLines={1}>
              {event.organizerName}
            </Text>
          ) : null}
        </View>

        {editorsPick ? (
          <Badge label="Editor's Pick" variant="editorsPick" />
        ) : event.ticketsRequired ? (
          <View style={styles.tixRow}>
            <MailIcon size={16} color={color.khakis} />
            <Text style={styles.tixLabel}>RSVP Required</Text>
          </View>
        ) : sponsored ? (
          <Text style={styles.sponsored}>Sponsored</Text>
        ) : null}
      </View>

      <Pressable
        accessibilityLabel={saved ? "Remove from saved" : "Save event"}
        accessibilityRole="button"
        accessibilityState={{ selected: saved }}
        disabled={!onToggleSave}
        hitSlop={6}
        onPress={onToggleSave}
        style={styles.bookmark}
      >
        <HeartIcon size={24} color={saved ? color.gulchGreen : color.white} />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    flexDirection: "row",
    height: 106,
    width: "100%",
  },
  pressed: {
    opacity: 0.85,
  },
  imageWrapper: {
    height: IMAGE_SIZE,
    width: IMAGE_SIZE,
  },
  image: {
    borderColor: color.oreo,
    borderRadius: radius.image,
    borderWidth: 0.5,
    height: IMAGE_SIZE,
    width: IMAGE_SIZE,
  },
  placeholder: {
    alignItems: "center",
    backgroundColor: color.gulchGreen,
    borderColor: color.oreo,
    borderRadius: radius.image,
    borderWidth: 0.5,
    height: IMAGE_SIZE,
    justifyContent: "center",
    width: IMAGE_SIZE,
  },
  content: {
    flex: 1,
    gap: space.xs,
    height: "100%",
    justifyContent: "center",
    paddingLeft: space.lg,
    paddingVertical: space.md,
  },
  timePill: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: color.darkChocolate,
    borderRadius: radius.pill,
    height: 20,
    justifyContent: "center",
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  timeLabel: {
    ...typePreset.label10Medium,
    color: color.khakis,
  },
  nameBlock: {
    alignItems: "flex-start",
  },
  name: {
    ...typePreset.captionBold12,
    color: color.white,
  },
  meta: {
    ...typePreset.caption12,
    color: color.khakis,
  },
  tixRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: space.xs,
  },
  tixLabel: {
    ...typePreset.label10Regular,
    color: color.khakis,
  },
  sponsored: {
    ...typePreset.label10Regular,
    color: color.beige300,
  },
  bookmark: {
    alignItems: "center",
    backgroundColor: color.darkChocolate,
    borderRadius: BOOKMARK_SIZE / 2,
    height: BOOKMARK_SIZE,
    justifyContent: "center",
    width: BOOKMARK_SIZE,
  },
});
