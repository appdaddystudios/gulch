import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { Badge } from "./Badge";
import { GulchLogo, MailIcon } from "./icons";
import type { EventListItem } from "../lib/events";
import { color, radius, space, type as typePreset } from "../theme";

const IMAGE_SIZE = 104;

type EventCardProps = {
  readonly event: EventListItem;
  readonly onPress?: () => void;
  readonly editorsPick?: boolean;
  readonly sponsored?: boolean;
};

export function EventCard({
  event,
  onPress,
  editorsPick = false,
  sponsored = false,
}: EventCardProps) {
  const hasImage = event.imageStatus === "ok" && Boolean(event.imageUrl);
  const hasLocation = Boolean(event.locationName);

  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && onPress ? styles.pressed : null]}
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
        <View style={styles.nameBlock}>
          <Text style={styles.name} numberOfLines={2}>
            {event.name}
          </Text>
          <View style={styles.metaRow}>
            {event.organizerName ? (
              <Text style={styles.meta} numberOfLines={1}>
                {event.organizerName}
              </Text>
            ) : null}
            {event.organizerName && hasLocation ? <View style={styles.dot} /> : null}
            {hasLocation ? (
              <Text style={styles.meta} numberOfLines={1}>
                {event.locationName}
              </Text>
            ) : null}
          </View>
        </View>

        {event.ticketsRequired ? (
          <View style={styles.tixRow}>
            <MailIcon size={16} color={color.white} />
            <Text style={styles.tixLabel}>RSVP Required</Text>
          </View>
        ) : null}

        {editorsPick ? <Badge label="Editor's Pick" variant="editorsPick" /> : null}
        {!editorsPick && sponsored ? <Text style={styles.sponsored}>Sponsored</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    flexDirection: "row",
    height: 106,
    overflow: "hidden",
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
    gap: space.sm,
    height: "100%",
    justifyContent: "center",
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  nameBlock: {
    alignItems: "flex-start",
  },
  name: {
    ...typePreset.captionBold12,
    color: color.white,
  },
  metaRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: space.md,
  },
  meta: {
    ...typePreset.caption12,
    color: color.khakis,
    flexShrink: 1,
  },
  dot: {
    backgroundColor: color.khakis,
    borderRadius: 2,
    height: 4,
    width: 4,
  },
  tixRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: space.xs,
  },
  tixLabel: {
    ...typePreset.label10Regular,
    color: color.white,
  },
  sponsored: {
    ...typePreset.label10Regular,
    color: color.beige300,
  },
});
