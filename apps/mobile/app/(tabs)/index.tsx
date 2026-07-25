import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { useCallback } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { BannerAdSlot, BannerCard, PromoBanner } from "../../components/Banner";
import { Button } from "../../components/Button";
import { Header } from "../../components/Header";
import { SearchBar } from "../../components/SearchBar";
import { SectionTitle } from "../../components/SectionTitle";
import { useDbClient, useQuery } from "../../hooks/useQuery";
import { listUpcomingEvents, type EventListItem } from "../../lib/events";
import {
  getHomeConfig,
  HOME_CONFIG_DEFAULTS,
  type HomeConfig,
} from "../../lib/homeConfig";
import { openLink } from "../../lib/openLink";
import { captureEvent } from "../../lib/telemetry";
import {
  listFeaturedOrganizers,
  type FeaturedOrganizer,
} from "../../lib/organizers";
import { color, space, type as typePreset } from "../../theme";

type HomeData = {
  readonly events: readonly EventListItem[];
  readonly organizers: readonly FeaturedOrganizer[];
  readonly config: HomeConfig;
};

const loadHome = async (
  client: Parameters<typeof listUpcomingEvents>[0],
): Promise<HomeData> => {
  const [events, organizers, config] = await Promise.all([
    listUpcomingEvents(client, { limit: 18 }),
    listFeaturedOrganizers(client, { limit: 9 }),
    getHomeConfig(client),
  ]);
  return { events, organizers, config };
};

export default function HomeScreen() {
  const router = useRouter();
  const client = useDbClient();
  const loader = useCallback(loadHome, []);
  const { state } = useQuery(client, loader);

  const data: HomeData =
    state.status === "ready"
      ? state.data
      : { events: [], organizers: [], config: HOME_CONFIG_DEFAULTS };

  const openSurvey = () => {
    captureEvent("survey_banner_tapped");
    void openLink(data.config.researchUrl, "research_banner");
  };

  const openBannerAd = () => {
    const ad = data.config.bannerAd;
    if (!ad) {
      return;
    }
    captureEvent("banner_ad_tapped", { kind: ad.kind });
    if (ad.linkUrl) {
      void openLink(ad.linkUrl, "banner_ad");
    }
  };

  const renderEventCards = (events: readonly EventListItem[]) =>
    events.map((event) => (
      <BannerCard
        key={event.id}
        title={event.name}
        subtitle={event.organizerName ?? "Event"}
        onPress={() => router.push(`/event/${event.id}?source=home`)}
      />
    ));

  return (
    <View style={styles.screen}>
      <Header />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <SearchBar onPress={() => router.push("/calendar")} />

        <Section title="Your Events">
          <Carousel state={state.status} emptyText="No upcoming events yet.">
            {renderEventCards(data.events.slice(0, 5))}
          </Carousel>
        </Section>

        {data.config.bannerAd ? (
          <BannerAdSlot ad={data.config.bannerAd} onPress={openBannerAd} />
        ) : null}

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

        <PromoBanner
          title="Hotspots Map"
          body="See what's happening around Atlanta right now."
          tone="light"
          minHeight={180}
          onPress={() => router.push("/map")}
          action={
            <Button
              label="Explore Map"
              size="s"
              tone="beige"
              onPress={() => router.push("/map")}
            />
          }
        />

        <Section title="Trending">
          <Carousel state={state.status} emptyText="Nothing trending yet.">
            {renderEventCards(data.events.slice(5, 11))}
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

        {/* TODO: back with on-device view history. */}
        <Section title="Recently Viewed">
          <Carousel
            state={state.status}
            emptyText="Events you open will show up here."
          >
            {renderEventCards(data.events.slice(11, 17))}
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
