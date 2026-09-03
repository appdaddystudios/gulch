import { useFocusEffect, useRouter } from "expo-router";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from "react-native";

import { BannerAdSlot, BannerCard, PromoBanner } from "../../components/Banner";
import { Button } from "../../components/Button";
import { Header } from "../../components/Header";
import { HomeDeckSection } from "../../components/HomeDeckSection";
import { SearchIcon } from "../../components/icons";
import { SearchBar } from "../../components/SearchBar";
import { SectionTitle } from "../../components/SectionTitle";
import { SeeMoreCard } from "../../components/SeeMoreCard";
import { useEventsByIds } from "../../hooks/useEventsByIds";
import { useDbClient, useQuery } from "../../hooks/useQuery";
import { useSavedEvents } from "../../hooks/useSavedEvents";
import { DECK_CAP } from "../../lib/deck";
import { isFrameInViewport, type LayoutFrame } from "../../lib/deckHint";
import {
  listDeckEvents,
  listTrendingEvents,
  listUpcomingEvents,
  type EventListItem,
} from "../../lib/events";
import { formatEventCardDate, formatFavoriteCount } from "../../lib/format";
import { pickEvents, type EventMap } from "../../lib/homeCache";
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
import { color, space, type as typePreset } from "../../theme";

// Past this scroll offset the search bar has scrolled away, so the header
// grows a search icon in its place (V3 "Home - Scrolled Search").
const SEARCH_COLLAPSE_OFFSET = 72;
const FAVORITES_LIMIT = 6;
const RECENT_LIMIT = 6;
// Bounds the `.in(...)` id filter Home sends to PostgREST — the carousels only
// render 6 items each, so a heavy saver must not bloat the request.
const SAVED_IDS_CAP = 30;

type HomeData = {
  readonly events: readonly EventListItem[];
  readonly trending: readonly EventListItem[];
  readonly deck: readonly EventListItem[];
  // Saved-id count this deck query reached past — the deck must not be dealt
  // from a page fetched before hydration knew the real count.
  readonly deckSavedCount: number;
  readonly byId: EventMap;
  readonly organizers: readonly FeaturedOrganizer[];
  readonly config: HomeConfig;
};

const TRENDING_LIMIT = 6;

// Stable placeholder while the page is pending, so `byId` keeps its identity
// across renders and downstream effects don't fire on every paint.
const EMPTY_HOME: HomeData = {
  events: [],
  trending: [],
  deck: [],
  deckSavedCount: -1,
  byId: new Map(),
  organizers: [],
  config: HOME_CONFIG_DEFAULTS,
};
const NO_IDS: readonly string[] = [];

const loadHome = async (
  client: Parameters<typeof listUpcomingEvents>[0],
  // The deck reducer drops saved ids client-side, so the query has to reach
  // past them or a returning user gets a short deck.
  savedCount: number,
): Promise<HomeData> => {
  const [events, ranked, deck, organizers, config] = await Promise.all([
    listUpcomingEvents(client, { limit: 12 }),
    listTrendingEvents(client, { limit: TRENDING_LIMIT }),
    listDeckEvents(client, { limit: DECK_CAP, excludeCount: savedCount }),
    listFeaturedOrganizers(client, { limit: 9 }),
    getHomeConfig(client),
  ]);
  // Every row the page already holds — a deck swipe-right or a Trending heart
  // then resolves in the Favorites row without a fetch.
  const byId = new Map(
    [...events, ...ranked, ...deck].map((event) => [event.id, event] as const),
  );
  // Save-ranked events lead; soonest upcoming fill the remaining slots so the
  // rail stays populated before any saves accumulate.
  const seen = new Set(ranked.map((event) => event.id));
  const trending = [
    ...ranked,
    ...events.filter((event) => !seen.has(event.id)),
  ].slice(0, TRENDING_LIMIT);
  return {
    events,
    trending,
    deck,
    deckSavedCount: savedCount,
    byId,
    organizers,
    config,
  };
};

export default function HomeScreen() {
  const router = useRouter();
  const client = useDbClient();
  const { savedIds, hydrated } = useSavedEvents();
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
  // The base page is fetched once per session (and again on pull-to-refresh),
  // never per save: the loader's identity only follows `hydrated`. The deck
  // query still needs the live saved count to reach past the ids the reducer
  // drops, so the loader reads it through a ref at call time. This effect is
  // declared before `useQuery` so it lands first in the hydration commit.
  const savedCount = savedIds.size;
  const savedCountRef = useRef(savedCount);
  useEffect(() => {
    savedCountRef.current = savedCount;
  }, [savedCount]);
  const loader = useCallback(
    (c: Parameters<typeof listUpcomingEvents>[0]) =>
      loadHome(c, savedCountRef.current),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hydrated],
  );
  // Gated on hydration so cold start makes one saved-aware request instead of
  // a pre- and post-hydration pair.
  const { state, refresh, refreshing } = useQuery(client, loader, {
    enabled: hydrated,
  });

  const data: HomeData = state.status === "ready" ? state.data : EMPTY_HOME;

  // Favorites and Recently Viewed derive from ids Home may not have rows for;
  // the id-cache fetches only those gaps, once the base page is in, and never
  // puts a section into the loading state.
  const wantedIds = useMemo(
    () => [...new Set([...savedList, ...recentIds])],
    [savedList, recentIds],
  );
  const merged = useEventsByIds(
    client,
    state.status === "ready" ? wantedIds : NO_IDS,
    data.byId,
  );

  // A pull-to-refresh swaps the page silently, but the deck must not swap
  // under a thumb: keep the last ready list so the stack only rebuilds when
  // its own hook decides it is safe.
  const [deckEvents, setDeckEvents] = useState<readonly EventListItem[]>([]);
  const [deckSavedCount, setDeckSavedCount] = useState(-1);
  useEffect(() => {
    if (state.status === "ready") {
      setDeckEvents(state.data.deck);
      setDeckSavedCount(state.data.deckSavedCount);
    } else if (state.status === "error") {
      // A failed page must not leave the deck waiting forever: settle it with
      // the rows already in hand so it is swipeable again. The carousels
      // surface the error; the deck just stops waiting.
      setDeckSavedCount(savedCount);
    }
  }, [savedCount, state]);

  // Soonest-first — savedList is id-sorted for a stable memo, which is
  // meaningless for display.
  const favoriteEvents = pickEvents(savedList, merged, {
    order: "soonest",
    limit: FAVORITES_LIMIT,
  });
  const recentEvents = pickEvents(recentIds, merged, {
    order: "given",
    limit: RECENT_LIMIT,
  });
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
  const openFavorites = () => {
    captureEvent("favorites_see_more_tapped");
    router.push("/favorites");
  };
  // Whether the deck is on screen, for its one-time hint. Scroll offset lives
  // in a ref and only the boolean is state, so scrolling doesn't re-render
  // Home every frame — it re-renders only when the deck enters or leaves.
  const scrollYRef = useRef(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [deckFrame, setDeckFrame] = useState<LayoutFrame | null>(null);
  const [deckInView, setDeckInView] = useState(false);
  const syncDeckInView = useCallback(
    (scrollY: number, frame: LayoutFrame | null, viewport: number) => {
      const inView = isFrameInViewport(frame, scrollY, viewport);
      setDeckInView((prev) => (prev === inView ? prev : inView));
    },
    [],
  );
  useEffect(() => {
    syncDeckInView(scrollYRef.current, deckFrame, viewportHeight);
  }, [deckFrame, viewportHeight, syncDeckInView]);
  const onViewportLayout = (event: LayoutChangeEvent) => {
    setViewportHeight(event.nativeEvent.layout.height);
  };
  const onDeckLayout = (event: LayoutChangeEvent) => {
    const { y, height } = event.nativeEvent.layout;
    setDeckFrame((prev) =>
      prev && prev.y === y && prev.height === height ? prev : { y, height },
    );
  };
  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = event.nativeEvent.contentOffset.y;
    scrollYRef.current = y;
    setHeaderSearch(y > SEARCH_COLLAPSE_OFFSET);
    syncDeckInView(y, deckFrame, viewportHeight);
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
          (showSaves ? formatFavoriteCount(event.saveCount) : null) ??
          formatEventCardDate(event.startAt)
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
        onLayout={onViewportLayout}
        onScroll={handleScroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={color.gulchGreen}
          />
        }
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        <SearchBar onPress={openSearch} />

        {/* The deck leads (device pass: it took the banner ad's slot); it
            renders nothing until dealt, so Trending simply moves up. */}
        <HomeDeckSection
          events={deckEvents}
          savedIds={savedIds}
          // Only a saved-aware page may be dealt. The base query is gated on
          // hydration, so any page that landed (count >= 0) reached past the
          // ids the deck will drop; later saves refill through the deck's
          // own hook rather than a refetch.
          savedCountMatches={deckSavedCount >= 0}
          visible={deckInView}
          onLayout={onDeckLayout}
        />

        <Section title="Trending">
          <Carousel state={state.status} emptyText="Nothing trending yet.">
            {renderEventCards(trendingEvents, { showSaves: true })}
          </Carousel>
        </Section>

        {bannerAd ? <BannerAdSlot ad={bannerAd} onPress={openBannerAd} /> : null}

        <Section title="Your Favorites">
          <Carousel
            state={state.status}
            emptyText="Tap the heart on any event to see it here."
          >
            {[
              ...renderEventCards(favoriteEvents),
              ...(favoriteEvents.length > 0
                ? [
                    <SeeMoreCard
                      key="see-more-favorites"
                      label="See More Favorites"
                      onPress={openFavorites}
                    />,
                  ]
                : []),
            ]}
          </Carousel>
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
