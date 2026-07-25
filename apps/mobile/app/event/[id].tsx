import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { Header } from "../../components/Header";
import {
  BookmarkIcon,
  DotsHorizontalIcon,
  GulchLogo,
  MarkerPinIcon,
  ShareIcon,
  TicketIcon,
} from "../../components/icons";
import { useDbClient, useQuery, type QueryState } from "../../hooks/useQuery";
import { useSavedEvents } from "../../hooks/useSavedEvents";
import { getEventDetail, type EventDetail } from "../../lib/events";
import { openLink } from "../../lib/openLink";
import { formatEventDateTime } from "../../lib/format";
import { color, font, radius, space, type as typePreset } from "../../theme";

export default function EventDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  const client = useDbClient();
  const loader = useCallback(
    (c: NonNullable<ReturnType<typeof useDbClient>>) =>
      getEventDetail(c, id ?? ""),
    [id],
  );
  const { state } = useQuery(client, loader);

  const openExternal = (url: string | null) => {
    void openLink(url);
  };

  const externalLink =
    state.status === "ready" ? (state.data?.externalLink ?? null) : null;

  const rightAction =
    state.status === "ready" && state.data ? (
      <>
        <Pressable
          accessibilityLabel="Open event link"
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => openExternal(externalLink)}
        >
          <ShareIcon size={24} color={color.khakis} />
        </Pressable>
        {/* TODO: overflow menu (report, etc.) — not built yet. */}
        <Pressable
          accessibilityLabel="More options"
          accessibilityRole="button"
          hitSlop={8}
        >
          <DotsHorizontalIcon size={24} color={color.khakis} />
        </Pressable>
      </>
    ) : null;

  return (
    <View style={styles.screen}>
      <Header
        showBack
        showLogo={false}
        onBack={() => router.back()}
        rightAction={rightAction}
      />
      <Content state={state} />
    </View>
  );
}

function Content({
  state,
}: {
  readonly state: QueryState<EventDetail | null>;
}) {
  const insets = useSafeAreaInsets();
  const { isSaved, toggle } = useSavedEvents();
  const [heroImageFailed, setHeroImageFailed] = useState(false);

  if (state.status === "loading") {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={color.gulchGreen} size="large" />
      </View>
    );
  }

  if (state.status === "missing-client") {
    return (
      <View style={styles.centered}>
        <EmptyState
          title="Not connected"
          subtitle="Supabase environment variables are not configured."
        />
      </View>
    );
  }

  if (state.status === "error") {
    return (
      <View style={styles.centered}>
        <EmptyState title="Couldn't load event" subtitle={state.message} />
      </View>
    );
  }

  if (!state.data) {
    return (
      <View style={styles.centered}>
        <EmptyState
          title="Event not found"
          subtitle="This event may have been removed."
        />
      </View>
    );
  }

  const event = state.data;
  // Any stored image renders — a transient pipeline status ("pending"/"failed"
  // after a re-mark) must not hide a previously good rehosted image.
  const hasImage = Boolean(event.imageUrl) && !heroImageFailed;

  return (
    <View style={styles.flex}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          {hasImage ? (
            <Image
              accessibilityIgnoresInvertColors
              onError={() => setHeroImageFailed(true)}
              source={{ uri: event.imageUrl as string }}
              style={styles.heroImage}
            />
          ) : (
            <View style={styles.heroPlaceholder}>
              <GulchLogo width={160} height={20} />
            </View>
          )}
          <LinearGradient
            colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.1)", "rgba(0,0,0,0.8)"]}
            locations={[0, 0.7, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </View>

        <View style={styles.form}>
          <Text style={styles.date}>
            {formatEventDateTime(event.startAt, {
              endAt: event.endAt,
              customTimeDescription: event.customTimeDescription,
            })}
          </Text>
          <Text style={styles.title}>{event.name}</Text>

          {event.organizerName || event.locationName ? (
            <View style={styles.metaRow}>
              {event.organizerName ? (
                <Text style={styles.org}>{event.organizerName}</Text>
              ) : null}
              {event.locationName ? (
                <View style={styles.location}>
                  <MarkerPinIcon size={16} color={color.khakis} />
                  <Text style={styles.locationText}>{event.locationName}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {event.ticketsRequired ? (
            <View style={styles.rsvp}>
              <Button
                label="RSVP Required"
                size="m"
                tone="outline"
                leftIcon={<TicketIcon size={16} color={color.white} />}
              />
            </View>
          ) : null}
        </View>
      </ScrollView>

      <View
        style={[
          styles.stickyButtons,
          { paddingBottom: Math.max(insets.bottom, space.md) },
        ]}
      >
        <Pressable
          accessibilityLabel={
            isSaved(event.id)
              ? "Remove from Your Lineup"
              : "Save to Your Lineup"
          }
          accessibilityRole="button"
          accessibilityState={{ selected: isSaved(event.id) }}
          onPress={() => toggle(event.id)}
          style={({ pressed }) => [
            styles.saveButton,
            pressed ? styles.saved : null,
          ]}
        >
          <BookmarkIcon size={16} color={color.oreo} />
          <Text style={styles.saveLabel}>
            {isSaved(event.id) ? "Saved to Your Lineup" : "Save to Your Lineup"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: color.oreo,
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
  },
  hero: {
    aspectRatio: 1,
    width: "100%",
  },
  heroImage: {
    height: "100%",
    width: "100%",
  },
  heroPlaceholder: {
    alignItems: "center",
    backgroundColor: color.gulchGreen,
    height: "100%",
    justifyContent: "center",
    width: "100%",
  },
  form: {
    gap: space.lg,
    paddingBottom: space.huge,
    paddingHorizontal: space.xl,
    paddingTop: space.xxl,
  },
  date: {
    ...typePreset.caption12,
    color: color.khakis,
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 21,
  },
  title: {
    ...typePreset.h24Bold,
    color: color.white,
  },
  metaRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.xl,
  },
  org: {
    color: color.khakis,
    fontFamily: font.medium,
    fontSize: 16,
    lineHeight: 24,
  },
  location: {
    alignItems: "center",
    flexDirection: "row",
    gap: space.xxs,
  },
  locationText: {
    ...typePreset.body16,
    color: color.khakis,
  },
  rsvp: {
    alignItems: "flex-start",
  },
  stickyButtons: {
    backgroundColor: color.oreo,
    paddingHorizontal: space.xl,
    paddingTop: space.md,
  },
  saveButton: {
    alignItems: "center",
    backgroundColor: color.white,
    borderColor: color.khakis,
    borderRadius: radius.pill,
    borderWidth: 2,
    flexDirection: "row",
    gap: space.sm,
    height: 48,
    justifyContent: "center",
    // Hard offset shadow (2px 2px 0 #DBD1C3).
    shadowColor: color.khakis,
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 2,
    width: "100%",
  },
  saved: {
    opacity: 0.7,
  },
  saveLabel: {
    ...typePreset.body16,
    color: color.oreo,
    fontFamily: font.medium,
  },
});
