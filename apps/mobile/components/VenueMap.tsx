import Mapbox from "@rnmapbox/maps";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { Button } from "./Button";
import { EmptyState } from "./EmptyState";
import { EventCard } from "./EventCard";
import { MapIcon } from "./icons";
import { useDbClient, useQuery, type QueryState } from "../hooks/useQuery";
import { useSavedEvents } from "../hooks/useSavedEvents";
import { listMapVenues, type MapVenue } from "../lib/mapEvents";
import { captureEvent } from "../lib/telemetry";
import { color, radius, space, type as typePreset } from "../theme";

// Expo inlines only static dot-notation env reads.
const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "";

if (MAPBOX_TOKEN) {
  void Mapbox.setAccessToken(MAPBOX_TOKEN);
}

// Metro Atlanta, framed around downtown/midtown where most venues cluster.
const ATLANTA_CENTER: readonly [number, number] = [-84.388, 33.758];
const DEFAULT_ZOOM = 11;
const COMPACT_ZOOM = 10.2;
const PIN_SIZE = 36;

type VenueMapProps = {
  // Compact mode scales the map into a card (Home "Hotspots Map"): tighter
  // zoom, slimmer venue sheet — same pins, selection, and navigation.
  readonly compact?: boolean;
  readonly eventSource?: string;
};

// The live venue map extracted from the Map tab so Home can embed the same
// functionality inside a card (V3 requirement: "same function, scaled").
export function VenueMap({ compact = false, eventSource = "map" }: VenueMapProps) {
  const client = useDbClient();
  const loader = useCallback(
    (c: NonNullable<ReturnType<typeof useDbClient>>) => listMapVenues(c),
    [],
  );
  const { state, reload } = useQuery(client, loader);

  return <Content state={state} onRetry={reload} compact={compact} eventSource={eventSource} />;
}

function Content({
  state,
  onRetry,
  compact,
  eventSource,
}: {
  readonly state: QueryState<readonly MapVenue[]>;
  readonly onRetry: () => void;
  readonly compact: boolean;
  readonly eventSource: string;
}) {
  const router = useRouter();
  const { isSaved, toggle } = useSavedEvents();
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);

  if (!MAPBOX_TOKEN) {
    return (
      <Centered>
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
      <Centered>
        <ActivityIndicator color={color.gulchGreen} size="large" />
      </Centered>
    );
  }

  if (state.status === "missing-client") {
    return (
      <Centered>
        <EmptyState
          title="Not connected"
          subtitle="Supabase environment variables are not configured."
        />
      </Centered>
    );
  }

  if (state.status === "error") {
    return (
      <Centered>
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
            zoomLevel: compact ? COMPACT_ZOOM : DEFAULT_ZOOM,
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
        <View style={styles.emptyOverlay} pointerEvents="none">
          <EmptyState
            icon={<MapIcon size={48} color={color.gulchGreen} />}
            title="Nothing to map yet"
            subtitle="No upcoming events with locations yet."
          />
        </View>
      ) : null}

      {selectedVenue ? (
        <VenueCards
          venue={selectedVenue}
          compact={compact}
          isSaved={isSaved}
          onToggleSave={toggle}
          onOpenEvent={(id) => router.push(`/event/${id}?source=${eventSource}`)}
        />
      ) : null}
    </View>
  );
}

function Centered({ children }: { readonly children: ReactNode }) {
  return <View style={styles.centered}>{children}</View>;
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
  compact,
  isSaved,
  onToggleSave,
  onOpenEvent,
}: {
  readonly venue: MapVenue;
  readonly compact: boolean;
  readonly isSaved: (id: string) => boolean;
  readonly onToggleSave: (id: string) => void;
  readonly onOpenEvent: (id: string) => void;
}) {
  const { width } = useWindowDimensions();
  // Compact cards sit inside a padded card, not the full screen width.
  const cardWidth = width - space.md * 2 - (compact ? space.md * 2 : 0);

  return (
    <View style={[styles.venueSheet, compact ? styles.venueSheetCompact : null]}>
      <Text style={styles.venueName} numberOfLines={1}>
        {venue.name}
      </Text>
      <FlatList
        horizontal
        data={venue.events}
        keyExtractor={(event) => event.id}
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardWidth + space.md}
        decelerationRate="fast"
        contentContainerStyle={styles.venueCardsRow}
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
  venueSheetCompact: {
    paddingBottom: space.md,
    paddingTop: space.md,
  },
  venueName: {
    ...typePreset.bodyBold14,
    color: color.white,
    paddingHorizontal: space.xl,
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
