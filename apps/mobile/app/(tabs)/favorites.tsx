import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { EventCard } from "../../components/EventCard";
import { Header } from "../../components/Header";
import { HeartIcon } from "../../components/icons";
import { Toast } from "../../components/Toast";
import { useDbClient, useQuery, type QueryState } from "../../hooks/useQuery";
import { useSaveToast } from "../../hooks/useSaveToast";
import { listEventsByIds, type EventListItem } from "../../lib/events";
import { color, font, space } from "../../theme";

type FavoritesSection = {
  readonly title: "Upcoming" | "Past";
  readonly data: readonly EventListItem[];
};

// V3 Favorites (replaces Lineup): saved events split into Upcoming and Past.
export default function FavoritesScreen() {
  const router = useRouter();
  const client = useDbClient();
  const { savedIds, isSaved, toggle, toastVisible, toastNonce, dismissToast } =
    useSaveToast();

  const ids = useMemo(() => [...savedIds].sort(), [savedIds]);
  const loader = useCallback(
    (c: NonNullable<ReturnType<typeof useDbClient>>) => listEventsByIds(c, ids),
    [ids],
  );
  const { state } = useQuery(client, loader);

  return (
    <View style={styles.screen}>
      <Header />
      <Body
        state={state}
        onPressEvent={(event) =>
          router.push(`/event/${event.id}?source=favorites`)
        }
        onExplore={() => router.push("/calendar")}
        isSaved={isSaved}
        onToggleSave={toggle}
      />
      <Toast
        key={toastNonce}
        message="Added to your favorites"
        visible={toastVisible}
        onDismiss={dismissToast}
      />
    </View>
  );
}

function Body({
  state,
  onPressEvent,
  onExplore,
  isSaved,
  onToggleSave,
}: {
  readonly state: QueryState<readonly EventListItem[]>;
  readonly onPressEvent: (event: EventListItem) => void;
  readonly onExplore: () => void;
  readonly isSaved: (id: string) => boolean;
  readonly onToggleSave: (id: string) => void;
}) {
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

  if (state.status === "loading") {
    return (
      <Centered>
        <ActivityIndicator color={color.gulchGreen} size="large" />
      </Centered>
    );
  }

  if (state.status === "error") {
    return (
      <Centered>
        <EmptyState
          title="Couldn't load your favorites"
          subtitle={state.message}
        />
      </Centered>
    );
  }

  if (state.data.length === 0) {
    return (
      <Centered>
        <EmptyState
          icon={<HeartIcon size={48} color={color.gulchGreen} filled />}
          title="Save Your Favorites"
          subtitle="Keep track of shows and events in one place so you can plan ahead."
          action={
            <Button label="Explore Events" tone="light" onPress={onExplore} />
          }
        />
      </Centered>
    );
  }

  // listEventsByIds returns ascending by start time; Past reads best most
  // recent first.
  const now = Date.now();
  const upcoming = state.data.filter(
    (event) => new Date(event.startAt).getTime() >= now,
  );
  const past = state.data
    .filter((event) => new Date(event.startAt).getTime() < now)
    .reverse();
  const sections: FavoritesSection[] = [
    { title: "Upcoming", data: upcoming },
    { title: "Past", data: past },
  ];

  return (
    <SectionList<EventListItem, FavoritesSection>
      contentContainerStyle={styles.listContent}
      sections={sections}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <EventCard
          event={item}
          onPress={() => onPressEvent(item)}
          saved={isSaved(item.id)}
          onToggleSave={() => onToggleSave(item.id)}
        />
      )}
      renderSectionHeader={({ section }) => (
        <Text style={styles.sectionTitle}>{section.title}</Text>
      )}
      renderSectionFooter={({ section }) =>
        section.data.length === 0 ? (
          <Text style={styles.sectionEmpty}>
            {section.title === "Upcoming"
              ? "No upcoming favorites yet."
              : "No past favorites yet."}
          </Text>
        ) : null
      }
      ItemSeparatorComponent={Separator}
      stickySectionHeadersEnabled={false}
      showsVerticalScrollIndicator={false}
    />
  );
}

function Centered({ children }: { readonly children: ReactNode }) {
  return <View style={styles.centered}>{children}</View>;
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  screen: {
    // Oreo (darker) so the darkChocolate time pill + heart button read on cards.
    backgroundColor: color.oreo,
    flex: 1,
  },
  listContent: {
    paddingBottom: space.xxl,
    paddingHorizontal: space.md,
    paddingTop: space.md,
  },
  sectionTitle: {
    color: color.white,
    fontFamily: font.bold,
    fontSize: 24,
    lineHeight: 30,
    paddingBottom: space.md,
    paddingTop: space.lg,
  },
  sectionEmpty: {
    color: color.khakis,
    fontFamily: font.regular,
    fontSize: 12,
    lineHeight: 18,
    paddingBottom: space.lg,
  },
  separator: {
    height: space.xl,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
  },
});
