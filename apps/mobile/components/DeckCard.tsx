import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { Badge } from "./Badge";
import type { EventListItem } from "../lib/events";
import { formatEventTimeCompact } from "../lib/format";
import { color, hardShadow, radius, space, type as typePreset } from "../theme";

// Figma 40000060:2529 measures a 370 card with a 2px stroke; overlay offsets
// below are relative to the inner (padding) box, so 2px less than the frame.
const BORDER = 2;
const OVERLAY_LEFT = 18 - BORDER;
// Title (≤2 lines) → organizer → pill stack ends 5px above the frame edge.
const OVERLAY_BOTTOM = 5 - BORDER;
const TITLE_MAX_WIDTH = 208;
const BADGE_TOP = 8 - BORDER;

type DeckCardProps = {
  readonly event: EventListItem;
};

const timeLabelOf = (event: EventListItem): string =>
  formatEventTimeCompact(event.startAt, {
    endAt: event.endAt,
    customTimeDescription: event.customTimeDescription,
  });

// Organizer when present, else the venue (same fallback as EventCard).
const metaLabelOf = (event: EventListItem): string | null =>
  event.organizerName ?? event.locationName;

// "<name>, <organizer>, <date>" — shared with the deck container so VoiceOver
// announces the top card even though the engine groups the stack.
export const deckCardLabel = (event: EventListItem): string =>
  [event.name, metaLabelOf(event), timeLabelOf(event)]
    .filter((part): part is string => Boolean(part))
    .join(", ");

// Face of one Home swipe-deck card: square hero image with the title, meta
// line and time pill laid over the bottom-left (no scrim — per Figma). Fills
// the slot the deck engine gives it; the engine owns gestures, so this is a
// plain View.
export function DeckCard({ event }: DeckCardProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const timeLabel = timeLabelOf(event);
  const metaLabel = metaLabelOf(event);

  return (
    <View accessible accessibilityLabel={deckCardLabel(event)} style={styles.shadow}>
      <View style={styles.card}>
        {event.imageUrl && !imageFailed ? (
          <Image
            accessibilityIgnoresInvertColors
            onError={() => setImageFailed(true)}
            resizeMode="cover"
            source={{ uri: event.imageUrl }}
            style={StyleSheet.absoluteFill}
          />
        ) : null}

        {event.editorsPick ? (
          <View style={styles.badge} pointerEvents="none">
            <Badge label="Editor's Pick" variant="editorsPick" />
          </View>
        ) : null}

        <View style={styles.overlay} pointerEvents="none">
          <Text style={styles.title} numberOfLines={2}>
            {event.name}
          </Text>
          {metaLabel ? (
            <Text style={styles.meta} numberOfLines={1}>
              {metaLabel}
            </Text>
          ) : null}
          {timeLabel ? (
            <View style={styles.timePill}>
              <Text style={styles.timeLabel} numberOfLines={1}>
                {timeLabel}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Shadow and clipping can't share a view on iOS (masksToBounds clips the
  // shadow), so the shadow sits on an unclipped wrapper.
  shadow: {
    ...hardShadow,
    backgroundColor: color.brown400,
    borderRadius: radius.card,
    flex: 1,
  },
  card: {
    backgroundColor: color.brown400,
    borderColor: color.oreo,
    borderRadius: radius.card,
    borderWidth: BORDER,
    flex: 1,
    overflow: "hidden",
  },
  badge: {
    alignItems: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: BADGE_TOP,
  },
  overlay: {
    alignItems: "flex-start",
    bottom: OVERLAY_BOTTOM,
    left: OVERLAY_LEFT,
    position: "absolute",
    right: OVERLAY_LEFT,
  },
  title: {
    ...typePreset.captionBold12,
    color: color.white,
    maxWidth: TITLE_MAX_WIDTH,
  },
  meta: {
    ...typePreset.caption12,
    color: color.khakis,
  },
  timePill: {
    backgroundColor: color.oreo,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  timeLabel: {
    ...typePreset.label10Medium,
    color: color.khakis,
  },
});
