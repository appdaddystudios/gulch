import Mapbox from "@rnmapbox/maps";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import type { ViewToken } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "./Button";
import { EmptyState } from "./EmptyState";
import { EventCard } from "./EventCard";
import { MapIcon } from "./icons";
import { Toast } from "./Toast";
import { useDbClient, useQuery, type QueryState } from "../hooks/useQuery";
import { useSaveToast } from "../hooks/useSaveToast";
import { listMapVenues, type MapVenue } from "../lib/mapEvents";
import { captureEvent } from "../lib/telemetry";
import {
  SHEET_PEEK,
  venueCardWidth,
  venueSheetA11yLabel,
  venueSheetCounter,
} from "../lib/venueSheet";
import { color, radius, space, type as typePreset } from "../theme";

// Expo inlines only static dot-notation env reads.
const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "";

if (MAPBOX_TOKEN) {
  void Mapbox.setAccessToken(MAPBOX_TOKEN);
}

// Metro Atlanta, framed around downtown/midtown where most venues cluster.
const ATLANTA_CENTER: readonly [number, number] = [-84.388, 33.758];
const DEFAULT_ZOOM = 11;
const PIN_SIZE = 36;
// A card counts as "current" once this much of it is on screen.
const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 60 };

// The live venue map behind the Map tab (pins, venue sheet, save + open).
// Renders full-bleed: the map runs under the status bar, so only the non-map
// overlays (loading/error/empty states) pad for the top inset.
export function VenueMap() {
  const client = useDbClient();
  const loader = useCallback(
    (c: NonNullable<ReturnType<typeof useDbClient>>) => listMapVenues(c),
    [],
  );
  const { state, reload } = useQuery(client, loader);

  return <Content state={state} onRetry={reload} />;
}

function Content({
  state,
  onRetry,
}: {
  readonly state: QueryState<readonly MapVenue[]>;
  readonly onRetry: () => void;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isSaved, toggle, toastVisible, toastNonce, dismissToast } =
    useSaveToast();
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);

  if (!MAPBOX_TOKEN) {
    return (
      <Centered topInset={insets.top}>
        <EmptyState
          icon={<MapIcon size={48} color={color.gulchGreen} />}
          title="Map unavailable"
          subtitle="The Mapbox token is not configured for this build."
        />
      </Centered>
    );
  }

  if (state.status === "loading") {
    return (
      <Centered topInset={insets.top}>
        <ActivityIndicator color={color.gulchGreen} size="large" />
      </Centered>
    );
  }

  if (state.status === "missing-client") {
    return (
      <Centered topInset={insets.top}>
        <EmptyState
          title="Not connected"
          subtitle="Supabase environment variables are not configured."
        />
      </Centered>
    );
  }

  if (state.status === "error") {
    return (
      <Centered topInset={insets.top}>
        <EmptyState
          icon={<MapIcon size={48} color={color.gulchGreen} />}
          title="Couldn't load the map"
          subtitle={state.message}
          action={
            <Button
              label="Try Again"
              size="s"
              tone="primary"
              onPress={onRetry}
            />
          }
        />
      </Centered>
    );
  }

  const venues = state.data;
  const selectedVenue =
    venues.find((venue) => venue.id === selectedVenueId) ?? null;

  return (
    <View style={styles.mapWrap}>
      <Mapbox.MapView
        style={styles.map}
        styleURL={Mapbox.StyleURL.Dark}
        scaleBarEnabled={false}
        onPress={() => setSelectedVenueId(null)}
      >
        <Mapbox.Camera
          defaultSettings={{
            centerCoordinate: [...ATLANTA_CENTER],
            zoomLevel: DEFAULT_ZOOM,
          }}
        />
        {venues.map((venue) => (
          <Mapbox.MarkerView
            key={venue.id}
            coordinate={[venue.longitude, venue.latitude]}
            allowOverlap
          >
            <VenuePin
              venue={venue}
              selected={venue.id === selectedVenueId}
              onPress={() => {
                if (selectedVenueId !== venue.id) {
                  captureEvent("map_pin_tapped", {
                    venue_id: venue.id,
                    venue_name: venue.name,
                    event_count: venue.events.length,
                  });
                }
                setSelectedVenueId((current) =>
                  current === venue.id ? null : venue.id,
                );
              }}
            />
          </Mapbox.MarkerView>
        ))}
      </Mapbox.MapView>

      {venues.length === 0 ? (
        <View
          style={[styles.emptyOverlay, { paddingTop: insets.top }]}
          pointerEvents="none"
        >
          <EmptyState
            icon={<MapIcon size={48} color={color.gulchGreen} />}
            title="Nothing to map yet"
            subtitle="No upcoming events with locations yet."
          />
        </View>
      ) : null}

      {selectedVenue ? (
        // Keyed by venue so the sheet's scroll position and counter restart
        // when a different pin is chosen.
        <VenueCards
          key={selectedVenue.id}
          venue={selectedVenue}
          isSaved={isSaved}
          onToggleSave={toggle}
          onOpenEvent={(id) => router.push(`/event/${id}?source=map`)}
        />
      ) : null}

      {/* The map runs under the status bar, so the toast's own top offset is
          measured from below the safe area rather than the physical edge. */}
      <View
        pointerEvents="box-none"
        style={[styles.toastInset, { top: insets.top }]}
      >
        <Toast
          key={toastNonce}
          message="Added to your favorites"
          visible={toastVisible}
          onDismiss={dismissToast}
        />
      </View>
    </View>
  );
}

function Centered({
  children,
  topInset,
}: {
  readonly children: ReactNode;
  readonly topInset: number;
}) {
  return (
    <View style={[styles.centered, { paddingTop: topInset }]}>{children}</View>
  );
}

function VenuePin({
  venue,
  selected,
  onPress,
}: {
  readonly venue: MapVenue;
  readonly selected: boolean;
  readonly onPress: () => void;
}) {
  const count = venue.events.length;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${venue.name}, ${count} ${count === 1 ? "event" : "events"}`}
      accessibilityState={{ selected }}
      hitSlop={6}
      onPress={onPress}
      style={[styles.pin, selected ? styles.pinSelected : null]}
    >
      <Text style={styles.pinCount}>{count}</Text>
    </Pressable>
  );
}

function VenueCards({
  venue,
  isSaved,
  onToggleSave,
  onOpenEvent,
}: {
  readonly venue: MapVenue;
  readonly isSaved: (id: string) => boolean;
  readonly onToggleSave: (id: string) => void;
  readonly onOpenEvent: (id: string) => void;
}) {
  const { width } = useWindowDimensions();
  const count = venue.events.length;
  const hasMore = count > 1;
  // Narrower than the window when there are several events so the next card
  // peeks in from the right — the cue that the row scrolls.
  const cardWidth = venueCardWidth(width, space.md, count);
  const [index, setIndex] = useState(0);
  const counter = venueSheetCounter(index, count);
  // FlatList requires this callback's identity to stay fixed for the list's
  // lifetime, hence the ref rather than an inline function.
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { readonly viewableItems: readonly ViewToken[] }) => {
      const first = viewableItems[0]?.index;
      if (typeof first === "number") {
        setIndex(first);
      }
    },
  ).current;

  return (
    <View style={styles.venueSheet}>
      {/* Name may truncate; the counter sits beside it and never shrinks, so
          a long venue name or large text can't hide the position. */}
      <View style={styles.venueTitleRow}>
        <Text
          accessibilityLabel={venueSheetA11yLabel(venue.name, index, count)}
          accessibilityRole="header"
          style={styles.venueName}
          numberOfLines={1}
        >
          {venue.name}
        </Text>
        {counter ? (
          <Text
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={styles.venueCounter}
          >
            {counter}
          </Text>
        ) : null}
      </View>
      <FlatList
        horizontal
        data={venue.events}
        keyExtractor={(event) => event.id}
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardWidth + space.md}
        snapToAlignment="start"
        decelerationRate="fast"
        contentContainerStyle={[
          styles.venueCardsRow,
          // Trailing room so the last card can still snap to the start edge.
          hasMore ? { paddingRight: SHEET_PEEK } : null,
        ]}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={VIEWABILITY_CONFIG}
        renderItem={({ item }) => (
          <View style={[styles.venueCard, { width: cardWidth }]}>
            <EventCard
              event={item}
              onPress={() => onOpenEvent(item.id)}
              saved={isSaved(item.id)}
              onToggleSave={() => onToggleSave(item.id)}
            />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
  },
  mapWrap: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  emptyOverlay: {
    alignItems: "center",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  pin: {
    alignItems: "center",
    backgroundColor: color.gulchGreen,
    borderColor: color.oreo,
    borderRadius: PIN_SIZE / 2,
    borderWidth: 2,
    height: PIN_SIZE,
    justifyContent: "center",
    // Hard offset shadow (2px 2px 0 #291407) per the brand's card language.
    shadowColor: color.oreo,
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 2,
    width: PIN_SIZE,
  },
  pinSelected: {
    borderColor: color.white,
    transform: [{ scale: 1.2 }],
  },
  pinCount: {
    ...typePreset.captionBold12,
    color: color.oreo,
  },
  venueSheet: {
    backgroundColor: color.darkChocolate,
    borderColor: color.oreo,
    borderTopWidth: 2,
    bottom: 0,
    gap: space.md,
    left: 0,
    paddingBottom: space.xl,
    paddingTop: space.lg,
    position: "absolute",
    right: 0,
  },
  toastInset: {
    left: 0,
    position: "absolute",
    right: 0,
  },
  venueTitleRow: {
    alignItems: "baseline",
    flexDirection: "row",
    gap: space.sm,
    paddingHorizontal: space.xl,
  },
  venueName: {
    ...typePreset.bodyBold14,
    color: color.white,
    flexShrink: 1,
  },
  venueCounter: {
    ...typePreset.caption12,
    color: color.khakis,
    flexShrink: 0,
  },
  venueCardsRow: {
    gap: space.md,
    paddingHorizontal: space.md,
  },
  venueCard: {
    backgroundColor: color.brown400,
    borderColor: color.oreo,
    borderRadius: radius.image,
    borderWidth: 1,
    paddingHorizontal: space.md,
  },
});
