import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  StyleSheet,
  View,
} from "react-native";

import { EmptyState } from "../../components/EmptyState";
import { EventCard } from "../../components/EventCard";
import { Header } from "../../components/Header";
import { SearchBar } from "../../components/SearchBar";
import { useDbClient, useQuery, type QueryState } from "../../hooks/useQuery";
import { listUpcomingEvents, type EventListItem } from "../../lib/events";
import { color, space } from "../../theme";

const loadEvents = (client: Parameters<typeof listUpcomingEvents>[0]) =>
  listUpcomingEvents(client, { limit: 100 });

const matchesQuery = (event: EventListItem, query: string): boolean =>
  [event.name, event.organizerName, event.locationName]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLowerCase().includes(query));

export default function CalendarScreen() {
  const client = useDbClient();
  const loader = useCallback(loadEvents, []);
  const { state } = useQuery(client, loader);
  const [search, setSearch] = useState("");

  const events = state.status === "ready" ? state.data : [];
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query
      ? events.filter((event) => matchesQuery(event, query))
      : events;
  }, [events, search]);

  const openEvent = (event: EventListItem) => {
    if (event.externalLink) {
      void Linking.openURL(event.externalLink);
    }
  };

  return (
    <View style={styles.screen}>
      <Header />
      <View style={styles.searchContainer}>
        <SearchBar value={search} onChangeText={setSearch} />
      </View>
      <Body
        state={state}
        events={filtered}
        onPressEvent={openEvent}
        hasSearch={search.trim().length > 0}
      />
    </View>
  );
}

function Body({
  state,
  events,
  onPressEvent,
  hasSearch,
}: {
  readonly state: QueryState<readonly EventListItem[]>;
  readonly events: readonly EventListItem[];
  readonly onPressEvent: (event: EventListItem) => void;
  readonly hasSearch: boolean;
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
        <EmptyState title="Couldn't load events" subtitle={state.message} />
      </Centered>
    );
  }

  if (events.length === 0) {
    return (
      <Centered>
        <EmptyState
          title={hasSearch ? "No matches" : "No upcoming events"}
          subtitle={
            hasSearch
              ? "Try a different search term."
              : "Check back soon for new events."
          }
        />
      </Centered>
    );
  }

  return (
    <FlatList
      contentContainerStyle={styles.listContent}
      data={events}
      ItemSeparatorComponent={Separator}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <EventCard event={item} onPress={() => onPressEvent(item)} />
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
  searchContainer: {
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  listContent: {
    paddingBottom: space.xxl,
    paddingHorizontal: space.md,
  },
  separator: {
    height: space.xl,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
  },
});
