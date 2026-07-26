import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
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

import { Badge } from "../../components/Badge";
import { EmptyState } from "../../components/EmptyState";
import { Header } from "../../components/Header";
import { Toast } from "../../components/Toast";
import { WebView } from "react-native-webview";

import {
  CloseIcon,
  DotsHorizontalIcon,
  GulchLogo,
  HeartIcon,
  LinkIcon,
  MarkerPinIcon,
  PlayIcon,
  ShareIcon,
  TicketIcon,
} from "../../components/icons";
import { useDbClient, useQuery, type QueryState } from "../../hooks/useQuery";
import { useSavedEvents } from "../../hooks/useSavedEvents";
import { getEventDetail, type EventDetail } from "../../lib/events";
import { instagramEmbedUrl } from "../../lib/instagramEmbed";
import { openLink } from "../../lib/openLink";
import { recordRecentlyViewed } from "../../lib/recentlyViewed";
import { captureEvent } from "../../lib/telemetry";
import { formatEventDateTime } from "../../lib/format";
import { color, font, radius, space, type as typePreset } from "../../theme";

export default function EventDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id: string | string[];
    source?: string | string[];
  }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const source = Array.isArray(params.source) ? params.source[0] : params.source;

  const client = useDbClient();
  const loader = useCallback(
    (c: NonNullable<ReturnType<typeof useDbClient>>) =>
      getEventDetail(c, id ?? ""),
    [id],
  );
  const { state } = useQuery(client, loader);

  // One event_viewed per load — `state` settles once per event id.
  useEffect(() => {
    if (state.status === "ready" && state.data) {
      captureEvent("event_viewed", {
        event_id: state.data.id,
        event_name: state.data.name,
        source: source ?? null,
      });
      void recordRecentlyViewed(state.data.id);
    }
  }, [state, source]);

  const openExternal = (url: string | null) => {
    void openLink(url, "event_share");
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
  const [videoOpen, setVideoOpen] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);

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
  const externalHref = event.externalLink;
  // Distinct context from the header share icon so link_opened attributes the
  // "More Information" surface correctly.
  const openExternal = (url: string) => {
    void openLink(url, "event_more_information");
  };
  // Any stored image renders — a transient pipeline status ("pending"/"failed"
  // after a re-mark) must not hide a previously good rehosted image.
  const hasImage = Boolean(event.imageUrl) && !heroImageFailed;
  // The raw mp4 is not scrapeable anonymously anymore, so playback uses
  // Instagram's public /embed/ player inside a WebView.
  const embedUrl = event.isVideo ? instagramEmbedUrl(event.externalLink) : null;

  const openVideo = () => {
    captureEvent("video_played", { event_id: event.id });
    setVideoOpen(true);
  };

  return (
    <View style={styles.flex}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          {videoOpen && embedUrl ? (
            <>
              <WebView
                allowsInlineMediaPlayback
                onError={() => setVideoOpen(false)}
                renderLoading={() => (
                  <View style={styles.videoLoading}>
                    <ActivityIndicator color={color.gulchGreen} size="large" />
                  </View>
                )}
                source={{ uri: embedUrl }}
                startInLoadingState
                style={styles.heroVideo}
              />
              <Pressable
                accessibilityLabel="Close video"
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => setVideoOpen(false)}
                style={styles.videoClose}
              >
                <CloseIcon size={18} color={color.white} />
              </Pressable>
            </>
          ) : (
            <>
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
                pointerEvents="none"
                style={StyleSheet.absoluteFill}
              />
              {event.editorsPick ? (
                <View style={styles.heroBadge}>
                  <Badge label="Editor's Pick" variant="editorsPick" />
                </View>
              ) : null}
              {embedUrl ? (
                <Pressable
                  accessibilityLabel="Watch video"
                  accessibilityRole="button"
                  onPress={openVideo}
                  style={({ pressed }) => [
                    styles.watchButton,
                    pressed ? styles.watchPressed : null,
                  ]}
                >
                  <PlayIcon size={16} color={color.white} />
                  <Text style={styles.watchLabel}>Watch video</Text>
                </Pressable>
              ) : null}
            </>
          )}
        </View>

        <View style={styles.form}>
          <View style={styles.datePill}>
            <Text style={styles.date}>
              {formatEventDateTime(event.startAt, {
                endAt: event.endAt,
                customTimeDescription: event.customTimeDescription,
              })}
            </Text>
          </View>
          <Text style={styles.title}>{event.name}</Text>

          {externalHref ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => openExternal(externalHref)}
              style={({ pressed }) => [
                styles.moreInfo,
                pressed ? styles.watchPressed : null,
              ]}
            >
              <LinkIcon size={16} color={color.white} />
              <Text style={styles.moreInfoLabel}>More Information</Text>
            </Pressable>
          ) : null}

          {event.organizerName ? (
            <View style={styles.organizedBy}>
              <Text style={styles.organizedByLabel}>Organized by</Text>
              <Text style={styles.org}>{event.organizerName}</Text>
            </View>
          ) : null}

          {event.locationName ? (
            <View style={styles.location}>
              <MarkerPinIcon size={16} color={color.khakis} />
              <Text style={styles.locationText}>{event.locationName}</Text>
            </View>
          ) : null}

          {event.ticketsRequired ? (
            <View style={styles.location}>
              <TicketIcon size={16} color={color.khakis} />
              <Text style={styles.locationText}>RSVP Required</Text>
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
            isSaved(event.id) ? "Remove from Favorites" : "Add to Favorites"
          }
          accessibilityRole="button"
          accessibilityState={{ selected: isSaved(event.id) }}
          onPress={() => {
            const adding = !isSaved(event.id);
            toggle(event.id);
            if (adding) {
              setToastVisible(true);
            }
          }}
          style={({ pressed }) => [
            isSaved(event.id) ? styles.savedButton : styles.saveButton,
            pressed ? styles.saved : null,
          ]}
        >
          <HeartIcon
            size={18}
            color={isSaved(event.id) ? color.gulchGreen : color.oreo}
            filled={isSaved(event.id)}
          />
          <Text
            style={isSaved(event.id) ? styles.savedLabel : styles.saveLabel}
          >
            {isSaved(event.id) ? "Added to Favorites" : "Add to Favorites"}
          </Text>
        </Pressable>
      </View>

      <Toast
        message="Added to your favorites"
        visible={toastVisible}
        onDismiss={() => setToastVisible(false)}
      />
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
    // Letterbox bars behind `contain` match the screen background.
    backgroundColor: color.oreo,
    width: "100%",
  },
  heroImage: {
    height: "100%",
    // Show the whole poster — Instagram art is often portrait and `cover`
    // crops the edges off.
    resizeMode: "contain",
    width: "100%",
  },
  heroPlaceholder: {
    alignItems: "center",
    backgroundColor: color.gulchGreen,
    height: "100%",
    justifyContent: "center",
    width: "100%",
  },
  heroVideo: {
    backgroundColor: color.oreo,
    flex: 1,
  },
  videoLoading: {
    alignItems: "center",
    backgroundColor: color.oreo,
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  videoClose: {
    alignItems: "center",
    backgroundColor: color.darkChocolate,
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    position: "absolute",
    right: space.lg,
    top: space.lg,
    width: 36,
  },
  watchButton: {
    alignItems: "center",
    backgroundColor: color.darkChocolate,
    borderRadius: radius.pill,
    bottom: space.lg,
    flexDirection: "row",
    gap: space.xs,
    height: 36,
    justifyContent: "center",
    paddingHorizontal: space.lg,
    position: "absolute",
    right: space.lg,
  },
  watchPressed: {
    opacity: 0.85,
  },
  watchLabel: {
    ...typePreset.caption12,
    color: color.white,
    fontFamily: font.medium,
  },
  form: {
    gap: space.lg,
    paddingBottom: space.huge,
    paddingHorizontal: space.xl,
    paddingTop: space.xxl,
  },
  heroBadge: {
    bottom: space.xl,
    left: space.xl,
    position: "absolute",
  },
  datePill: {
    alignSelf: "flex-start",
    backgroundColor: color.darkChocolate,
    borderColor: color.oreo,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
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
  moreInfo: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderColor: color.khakis,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    flexDirection: "row",
    gap: space.sm,
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
  },
  moreInfoLabel: {
    ...typePreset.bodyBold14,
    color: color.white,
  },
  organizedBy: {
    gap: space.xxs,
  },
  organizedByLabel: {
    ...typePreset.bodyBold14,
    color: color.white,
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
    gap: space.sm,
  },
  locationText: {
    ...typePreset.body16,
    color: color.khakis,
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
  savedButton: {
    alignItems: "center",
    backgroundColor: color.darkChocolate,
    borderColor: color.oreo,
    borderRadius: radius.pill,
    borderWidth: 2,
    flexDirection: "row",
    gap: space.sm,
    height: 48,
    justifyContent: "center",
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
  savedLabel: {
    ...typePreset.body16,
    color: color.khakis,
    fontFamily: font.medium,
  },
});
