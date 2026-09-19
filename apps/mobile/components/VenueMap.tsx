import Mapbox from "@rnmapbox/maps";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "./Button";
import { EmptyState } from "./EmptyState";
import { EventCard } from "./EventCard";
import { MapIcon } from "./icons";
import { Toast } from "./Toast";
import { useDbClient, useQuery, type QueryState } from "../hooks/useQuery";
import { useSaveToast } from "../hooks/useSaveToast";
import { eventCardHeight } from "../lib/eventCard";
import { listMapVenues, type MapVenue } from "../lib/mapEvents";
import { captureEvent } from "../lib/telemetry";
import { SHEET_PEEK, venueCardWidth } from "../lib/venueSheet";
import { color, space, type as typePreset } from "../theme";

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
// The floating venue cards never cover more than this share of the window.
const SHEET_MAX_RATIO = 0.62;

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
        // Keyed by venue so the row's scroll position restarts when a
        // different pin is chosen.
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
  const { width, height, fontScale } = useWindowDimensions();
  const count = venue.events.length;
  const hasMore = count > 1;
  // Narrower than the window when there are several events so the next card
  // peeks in from the right — the cue that the row scrolls.
  const cardWidth = venueCardWidth(width, space.xl, count);
  // One explicit height for every card of the venue (same rule as the Home
  // deck): a `fill` card has no intrinsic hero height, so the row cannot be
  // left to size itself from its cells.
  const cardHeight = eventCardHeight(cardWidth, fontScale);

  return (
    // Cards float over the map with no sheet of their own: the map stays
    // live around them and a tap on it dismisses them. Capped so a tall card
    // (large system text, small screen) can never run off the top; past the
    // cap the card area scrolls vertically.
    <View
      pointerEvents="box-none"
      style={[styles.venueCards, { maxHeight: height * SHEET_MAX_RATIO }]}
    >
      <ScrollView showsVerticalScrollIndicator={false}>
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
          renderItem={({ item }) => (
            // Every cell gets the same fixed height; `fill` lets a card with
            // less text grow its hero instead of leaving empty surface.
            <View style={{ height: cardHeight, width: cardWidth }}>
              <EventCard
                event={item}
                fill
                metaMode="venue"
                onPress={() => onOpenEvent(item.id)}
                saved={isSaved(item.id)}
                onToggleSave={() => onToggleSave(item.id)}
              />
            </View>
          )}
        />
      </ScrollView>
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
  venueCards: {
    bottom: 0,
    left: 0,
    paddingBottom: space.xl,
    position: "absolute",
    right: 0,
  },
  toastInset: {
    left: 0,
    position: "absolute",
    right: 0,
  },
  venueCardsRow: {
    gap: space.md,
    // Room for the card's 4pt hard shadow.
    paddingBottom: space.xs,
    paddingHorizontal: space.xl,
  },
});
