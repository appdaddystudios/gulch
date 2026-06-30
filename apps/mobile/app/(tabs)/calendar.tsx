import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, SectionList, StyleSheet, Text, View } from "react-native";

import { EmptyState } from "../../components/EmptyState";
import { EventCard } from "../../components/EventCard";
import { Header } from "../../components/Header";
import { SearchBar } from "../../components/SearchBar";
import { useDbClient, useQuery, type QueryState } from "../../hooks/useQuery";
import {
  groupEventsByWeek,
  listUpcomingEvents,
  type EventListItem,
  type EventWeekSection,
} from "../../lib/events";
import { color, font, space, type as typePreset } from "../../theme";

const loadEvents = (client: Parameters<typeof listUpcomingEvents>[0]) =>
  listUpcomingEvents(client, { limit: 100 });

const matchesQuery = (event: EventListItem, query: string): boolean =>
  [event.name, event.organizerName, event.locationName]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLowerCase().includes(query));

export default function CalendarScreen() {
  const router = useRouter();
  const client = useDbClient();
  const loader = useCallback(loadEvents, []);
  const { state } = useQuery(client, loader);
  const [search, setSearch] = useState("");

  const events = state.status === "ready" ? state.data : [];
  const sections = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = query
      ? events.filter((event) => matchesQuery(event, query))
      : events;
    return groupEventsByWeek(filtered);
  }, [events, search]);

  const openEvent = (event: EventListItem) => {
    router.push(`/event/${event.id}`);
  };

  return (
    <View style={styles.screen}>
      <Header />
      <View style={styles.searchContainer}>
        <SearchBar value={search} onChangeText={setSearch} />
      </View>
      <Body
        state={state}
        sections={sections}
        onPressEvent={openEvent}
        hasSearch={search.trim().length > 0}
      />
    </View>
  );
}

function Body({
  state,
  sections,
  onPressEvent,
  hasSearch,
}: {
  readonly state: QueryState<readonly EventListItem[]>;
  readonly sections: readonly EventWeekSection[];
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

  if (sections.length === 0) {
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
    <SectionList
      contentContainerStyle={styles.listContent}
      sections={sections as EventWeekSection[]}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <EventCard event={item} onPress={() => onPressEvent(item)} />
      )}
      renderSectionHeader={({ section }) => (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <View style={styles.sectionRule} />
        </View>
      )}
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
  sectionHeader: {
    alignItems: "center",
    backgroundColor: color.darkChocolate,
    flexDirection: "row",
    gap: space.md,
    paddingBottom: space.md,
    paddingTop: space.xl,
  },
  sectionTitle: {
    color: color.khakis,
    fontFamily: font.medium,
    fontSize: 14,
    lineHeight: 21,
  },
  sectionRule: {
    backgroundColor: color.brown300,
    flex: 1,
    height: 1,
  },
  separator: {
    height: space.xl,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
  },
});
