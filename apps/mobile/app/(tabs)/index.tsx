import { useFocusEffect, useRouter } from "expo-router";
import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";

import { BannerAdSlot, BannerCard, PromoBanner } from "../../components/Banner";
import { Button } from "../../components/Button";
import { Header } from "../../components/Header";
import { SearchIcon } from "../../components/icons";
import { SearchBar } from "../../components/SearchBar";
import { SectionTitle } from "../../components/SectionTitle";
import { VenueMap } from "../../components/VenueMap";
import { useDbClient, useQuery } from "../../hooks/useQuery";
import { useSavedEvents } from "../../hooks/useSavedEvents";
import {
  listEventsByIds,
  listTrendingEvents,
  listUpcomingEvents,
  type EventListItem,
} from "../../lib/events";
import {
  getHomeConfig,
  HOME_CONFIG_DEFAULTS,
  type HomeConfig,
} from "../../lib/homeConfig";
import { openLink } from "../../lib/openLink";
import {
  listFeaturedOrganizers,
  type FeaturedOrganizer,
} from "../../lib/organizers";
import { getRecentlyViewedIds } from "../../lib/recentlyViewed";
import { captureEvent } from "../../lib/telemetry";
import { color, radius, space, type as typePreset } from "../../theme";

// Past this scroll offset the search bar has scrolled away, so the header
// grows a search icon in its place (V3 "Home - Scrolled Search").
const SEARCH_COLLAPSE_OFFSET = 72;
const MAP_CARD_HEIGHT = 300;
const FAVORITES_LIMIT = 6;
const RECENT_LIMIT = 6;
// Bounds the `.in(...)` id filter Home sends to PostgREST — the carousels only
// render 6 items each, so a heavy saver must not bloat the request. TODO: once
// the save ledger ships, a server-side top-N query can replace the cap.
const SAVED_IDS_CAP = 30;

type HomeData = {
  readonly events: readonly EventListItem[];
  readonly trending: readonly EventListItem[];
  readonly byId: ReadonlyMap<string, EventListItem>;
  readonly organizers: readonly FeaturedOrganizer[];
  readonly config: HomeConfig;
};

const TRENDING_LIMIT = 6;

const loadHome = async (
  client: Parameters<typeof listUpcomingEvents>[0],
  extraIds: readonly string[],
): Promise<HomeData> => {
  const [events, ranked, extra, organizers, config] = await Promise.all([
    listUpcomingEvents(client, { limit: 12 }),
    listTrendingEvents(client, { limit: TRENDING_LIMIT }),
    extraIds.length > 0 ? listEventsByIds(client, extraIds) : Promise.resolve([]),
    listFeaturedOrganizers(client, { limit: 9 }),
    getHomeConfig(client),
  ]);
  const byId = new Map<string, EventListItem>();
  for (const event of [...events, ...extra]) {
    byId.set(event.id, event);
  }
  // Save-ranked events lead; soonest upcoming fill the remaining slots so the
  // rail stays populated before any saves accumulate.
  const seen = new Set(ranked.map((event) => event.id));
  const trending = [
    ...ranked,
    ...events.filter((event) => !seen.has(event.id)),
  ].slice(0, TRENDING_LIMIT);
  return { events, trending, byId, organizers, config };
};

export default function HomeScreen() {
  const router = useRouter();
  const client = useDbClient();
  const { savedIds } = useSavedEvents();
  const [recentIds, setRecentIds] = useState<readonly string[]>([]);
  const [headerSearch, setHeaderSearch] = useState(false);

  // Re-read view history whenever Home regains focus so a just-viewed event
  // appears without an app restart.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void getRecentlyViewedIds().then((ids) => {
        if (active) {
          setRecentIds(ids);
        }
      });
      return () => {
        active = false;
      };
    }, []),
  );

  const savedList = useMemo(
    () => [...savedIds].sort().slice(0, SAVED_IDS_CAP),
    [savedIds],
  );
  // Stable string deps so the loader identity only changes when ids change.
  const savedKey = savedList.join(",");
  const recentKey = recentIds.join(",");
  const loader = useCallback(
    (c: Parameters<typeof listUpcomingEvents>[0]) =>
      loadHome(c, [...new Set([...savedList, ...recentIds])]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [savedKey, recentKey],
  );
  const { state } = useQuery(client, loader);

  const data: HomeData =
    state.status === "ready"
      ? state.data
      : {
          events: [],
          trending: [],
          byId: new Map(),
          organizers: [],
          config: HOME_CONFIG_DEFAULTS,
        };

  // Soonest-first — savedList is id-sorted for stable query deps, which is
  // meaningless for display.
  const favoriteEvents = savedList
    .map((id) => data.byId.get(id))
    .filter((event): event is EventListItem => Boolean(event))
    .sort((a, b) => (a.startAt < b.startAt ? -1 : a.startAt > b.startAt ? 1 : 0))
    .slice(0, FAVORITES_LIMIT);
  const recentEvents = recentIds
    .map((id) => data.byId.get(id))
    .filter((event): event is EventListItem => Boolean(event))
    .slice(0, RECENT_LIMIT);
  // Trending = most-saved upcoming events, ranked server-side in loadHome.
  const trendingEvents = data.trending;

  // While loadHome is pending `data.config` is only the shipped fallback — a
  // tap then could open the wrong (superseded) survey URL, so wait for ready.
  const openSurvey =
    state.status === "ready"
      ? () => {
          captureEvent("survey_banner_tapped");
          void openLink(data.config.researchUrl, "research_banner");
        }
      : undefined;

  const bannerAd = data.config.bannerAd;
  // Linkless creatives are deliberately non-clickable: no handler, no button
  // affordance, no false tap metrics.
  const openBannerAd = bannerAd?.linkUrl
    ? () => {
        captureEvent("banner_ad_tapped", { kind: bannerAd.kind });
        void openLink(bannerAd.linkUrl, "banner_ad");
      }
    : undefined;

  const openSearch = () => router.push("/calendar");
  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setHeaderSearch(event.nativeEvent.contentOffset.y > SEARCH_COLLAPSE_OFFSET);
  };

  const renderEventCards = (
    events: readonly EventListItem[],
    { showSaves = false }: { readonly showSaves?: boolean } = {},
  ) =>
    events.map((event) => (
      <BannerCard
        key={event.id}
        title={event.name}
        subtitle={
          showSaves && event.saveCount > 0
            ? `${event.saveCount} ${event.saveCount === 1 ? "save" : "saves"}`
            : (event.organizerName ?? "Event")
        }
        onPress={() => router.push(`/event/${event.id}?source=home`)}
      />
    ));

  return (
    <View style={styles.screen}>
      <Header
        rightAction={
          headerSearch ? (
            <Pressable
              accessibilityLabel="Search events"
              accessibilityRole="button"
              hitSlop={8}
              onPress={openSearch}
            >
              <SearchIcon size={24} color={color.khakis} />
            </Pressable>
          ) : undefined
        }
      />
      <ScrollView
        contentContainerStyle={styles.content}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        <SearchBar onPress={openSearch} />

        <Section title="Your Favorites">
          <Carousel
            state={state.status}
            emptyText="Tap the heart on any event to see it here."
          >
            {renderEventCards(favoriteEvents)}
          </Carousel>
        </Section>

        {bannerAd ? <BannerAdSlot ad={bannerAd} onPress={openBannerAd} /> : null}

        <Section title="Trending">
          <Carousel state={state.status} emptyText="Nothing trending yet.">
            {renderEventCards(trendingEvents, { showSaves: true })}
          </Carousel>
        </Section>

        <Section title="Hotspots Map">
          <View style={styles.mapCard}>
            <VenueMap compact eventSource="home" />
          </View>
        </Section>

        <Section title="Recently Viewed">
          <Carousel
            state={state.status}
            emptyText="Events you open will show up here."
          >
            {renderEventCards(recentEvents)}
          </Carousel>
        </Section>

        <PromoBanner
          title="Participate in Research"
          body="Take the survey for a chance to win a $100 Visa gift card, all while supporting the community."
          tone="dark"
          onPress={openSurvey}
          action={
            <Button
              label={data.config.researchLabel}
              size="s"
              tone="primary"
              onPress={openSurvey}
            />
          }
        />

        <Section title="Featured Organizations">
          <Carousel
            state={state.status}
            emptyText="No featured organizations yet."
          >
            {data.organizers.map((organizer) => (
              <BannerCard
                key={organizer.id}
                title={organizer.name}
                subtitle="Organization"
                height={96}
                onPress={() =>
                  void openLink(organizer.instagramUrl, "organizer_instagram")
                }
              />
            ))}
          </Carousel>
        </Section>
      </ScrollView>
    </View>
  );
}

function Section({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <SectionTitle>{title}</SectionTitle>
      {children}
    </View>
  );
}

function Carousel({
  state,
  emptyText,
  children,
}: {
  readonly state: "missing-client" | "loading" | "error" | "ready";
  readonly emptyText: string;
  readonly children: readonly ReactNode[];
}) {
  if (state === "loading") {
    return (
      <ActivityIndicator
        color={color.gulchGreen}
        style={styles.carouselLoading}
      />
    );
  }

  if (state === "missing-client") {
    return <Text style={styles.muted}>Not connected.</Text>;
  }

  if (state === "error") {
    return <Text style={styles.muted}>Couldn't load.</Text>;
  }

  if (children.length === 0) {
    return <Text style={styles.muted}>{emptyText}</Text>;
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.carouselRow}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: color.darkChocolate,
    flex: 1,
  },
  content: {
    gap: space.xxl,
    paddingBottom: space.huge,
    paddingHorizontal: space.md,
    paddingTop: space.md,
  },
  section: {
    gap: space.md,
  },
  mapCard: {
    borderColor: color.oreo,
    borderRadius: radius.card,
    borderWidth: 2,
    height: MAP_CARD_HEIGHT,
    overflow: "hidden",
  },
  carouselRow: {
    gap: space.md,
  },
  carouselLoading: {
    alignSelf: "flex-start",
  },
  muted: {
    ...typePreset.caption12,
    color: color.khakis,
  },
});
