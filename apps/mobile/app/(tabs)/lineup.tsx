import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { useCallback, useMemo } from "react";
import { ActivityIndicator, FlatList, StyleSheet, View } from "react-native";

import { EmptyState } from "../../components/EmptyState";
import { EventCard } from "../../components/EventCard";
import { Header } from "../../components/Header";
import { LineupIcon } from "../../components/icons";
import { SectionTitle } from "../../components/SectionTitle";
import { useDbClient, useQuery, type QueryState } from "../../hooks/useQuery";
import { useSavedEvents } from "../../hooks/useSavedEvents";
import { listEventsByIds, type EventListItem } from "../../lib/events";
import { color, space } from "../../theme";

export default function LineupScreen() {
  const router = useRouter();
  const client = useDbClient();
  const { savedIds, isSaved, toggle } = useSavedEvents();

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
        onPressEvent={(event) => router.push(`/event/${event.id}`)}
        isSaved={isSaved}
        onToggleSave={toggle}
      />
    </View>
  );
}

function Body({
  state,
  onPressEvent,
  isSaved,
  onToggleSave,
}: {
  readonly state: QueryState<readonly EventListItem[]>;
  readonly onPressEvent: (event: EventListItem) => void;
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
        <EmptyState title="Couldn't load your lineup" subtitle={state.message} />
      </Centered>
    );
  }

  if (state.data.length === 0) {
    return (
      <Centered>
        <EmptyState
          icon={<LineupIcon size={48} color={color.gulchGreen} />}
          title="Your Lineup is empty"
          subtitle="Tap the heart on any event to save it here."
        />
      </Centered>
    );
  }

  return (
    <FlatList
      contentContainerStyle={styles.listContent}
      data={state.data}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={<SectionTitle>Your Lineup</SectionTitle>}
      ItemSeparatorComponent={Separator}
      renderItem={({ item }) => (
        <EventCard
          event={item}
          onPress={() => onPressEvent(item)}
          saved={isSaved(item.id)}
          onToggleSave={() => onToggleSave(item.id)}
        />
      )}
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
    backgroundColor: color.darkChocolate,
    flex: 1,
  },
  listContent: {
    gap: space.md,
    paddingBottom: space.xxl,
    paddingHorizontal: space.md,
    paddingTop: space.md,
  },
  separator: {
    height: space.xl,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
  },
});
