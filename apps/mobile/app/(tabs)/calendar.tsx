import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Button } from "../../components/Button";
import { DatePicker } from "../../components/DatePicker";
import { EmptyState } from "../../components/EmptyState";
import { EventCard } from "../../components/EventCard";
import { Header } from "../../components/Header";
import { FileQuestionIcon } from "../../components/icons";
import { SearchBar } from "../../components/SearchBar";
import { useDbClient, useQuery, type QueryState } from "../../hooks/useQuery";
import { useSavedEvents } from "../../hooks/useSavedEvents";
import { addMonths, type MonthCursor } from "../../lib/calendar";
import {
  groupEventsByWeek,
  listUpcomingEvents,
  type EventListItem,
  type EventWeekSection,
} from "../../lib/events";
import { dayKey } from "../../lib/format";
import { captureEvent } from "../../lib/telemetry";
import { color, font, radius, space, type as typePreset } from "../../theme";

type ViewMode = "list" | "calendar";

// Debounce so search_performed reflects settled queries, not every keystroke.
const SEARCH_CAPTURE_DELAY_MS = 1000;

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
  const { isSaved, toggle } = useSavedEvents();

  const [mode, setMode] = useState<ViewMode>("list");
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState<MonthCursor>(() => {
    const now = new Date();
    return { year: now.getFullYear(), monthIndex: now.getMonth() };
  });
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const events = state.status === "ready" ? state.data : [];
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query
      ? events.filter((event) => matchesQuery(event, query))
      : events;
  }, [events, search]);

  const sections = useMemo(() => groupEventsByWeek(filtered), [filtered]);
  const eventDayKeys = useMemo(
    () => new Set(filtered.map((event) => dayKey(event.startAt))),
    [filtered],
  );
  const dayEvents = useMemo(
    () =>
      selectedKey
        ? filtered.filter((event) => dayKey(event.startAt) === selectedKey)
        : [],
    [filtered, selectedKey],
  );

  useEffect(() => {
    const query = search.trim();
    if (!query) {
      return;
    }
    const timer = setTimeout(() => {
      captureEvent("search_performed", {
        query_length: query.length,
        result_count: filtered.length,
      });
    }, SEARCH_CAPTURE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [search, filtered]);

  const switchMode = (value: ViewMode) => {
    if (value !== mode) {
      captureEvent("calendar_view_toggled", { mode: value });
    }
    setMode(value);
  };

  const openEvent = (event: EventListItem) =>
    router.push(`/event/${event.id}?source=calendar`);
  const renderCard = (item: EventListItem) => (
    <EventCard
      event={item}
      onPress={() => openEvent(item)}
      saved={isSaved(item.id)}
      onToggleSave={() => toggle(item.id)}
    />
  );

  return (
    <View style={styles.screen}>
      <Header />
      <View style={styles.controls}>
        <SearchBar value={search} onChangeText={setSearch} />
        <Toggle mode={mode} onChange={switchMode} />
      </View>

      {state.status !== "ready" ? (
        <StatusView state={state} />
      ) : mode === "list" ? (
        <ListView
          sections={sections}
          hasSearch={search.trim().length > 0}
          onClear={() => setSearch("")}
          renderCard={renderCard}
        />
      ) : (
        <CalendarView
          cursor={cursor}
          selectedKey={selectedKey}
          eventDayKeys={eventDayKeys}
          dayEvents={dayEvents}
          onPrev={() => {
            setCursor((c) => addMonths(c, -1));
            setSelectedKey(null);
          }}
          onNext={() => {
            setCursor((c) => addMonths(c, 1));
            setSelectedKey(null);
          }}
          onSelectDay={(key) =>
            setSelectedKey((prev) => (prev === key ? null : key))
          }
          renderCard={renderCard}
        />
      )}
    </View>
  );
}

function Toggle({
  mode,
  onChange,
}: {
  readonly mode: ViewMode;
  readonly onChange: (mode: ViewMode) => void;
}) {
  return (
    <View style={styles.toggle}>
      {(["list", "calendar"] as const).map((value) => {
        const active = mode === value;
        return (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(value)}
            style={[styles.toggleButton, active ? styles.toggleActive : null]}
          >
            <Text
              style={[
                styles.toggleLabel,
                active ? styles.toggleLabelActive : null,
              ]}
            >
              {value === "list" ? "List" : "Calendar"}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function StatusView({
  state,
}: {
  readonly state: QueryState<readonly EventListItem[]>;
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
  if (state.status === "error") {
    return (
      <Centered>
        <EmptyState title="Couldn't load events" subtitle={state.message} />
      </Centered>
    );
  }
  return (
    <Centered>
      <ActivityIndicator color={color.gulchGreen} size="large" />
    </Centered>
  );
}

function ListView({
  sections,
  hasSearch,
  onClear,
  renderCard,
}: {
  readonly sections: readonly EventWeekSection[];
  readonly hasSearch: boolean;
  readonly onClear: () => void;
  readonly renderCard: (item: EventListItem) => ReactNode;
}) {
  if (sections.length === 0) {
    return hasSearch ? (
      <EmptyState
        align="top"
        icon={<FileQuestionIcon size={32} color={color.gulchGreen} />}
        title="No results"
        subtitle="Please try your search again using different terms."
        action={<Button label="Clear Search" tone="light" onPress={onClear} />}
      />
    ) : (
      <Centered>
        <EmptyState
          title="No upcoming events"
          subtitle="Check back soon for new events."
        />
      </Centered>
    );
  }

  return (
    <SectionList
      contentContainerStyle={styles.listContent}
      sections={sections as EventWeekSection[]}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <>{renderCard(item)}</>}
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

function CalendarView({
  cursor,
  selectedKey,
  eventDayKeys,
  dayEvents,
  onPrev,
  onNext,
  onSelectDay,
  renderCard,
}: {
  readonly cursor: MonthCursor;
  readonly selectedKey: string | null;
  readonly eventDayKeys: ReadonlySet<string>;
  readonly dayEvents: readonly EventListItem[];
  readonly onPrev: () => void;
  readonly onNext: () => void;
  readonly onSelectDay: (key: string) => void;
  readonly renderCard: (item: EventListItem) => ReactNode;
}) {
  return (
    <FlatList
      contentContainerStyle={styles.listContent}
      data={selectedKey ? dayEvents : []}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View style={styles.calendarHeader}>
          <DatePicker
            cursor={cursor}
            selectedKey={selectedKey}
            eventDayKeys={eventDayKeys}
            onPrev={onPrev}
            onNext={onNext}
            onSelectDay={onSelectDay}
          />
        </View>
      }
      renderItem={({ item }) => <>{renderCard(item)}</>}
      ItemSeparatorComponent={Separator}
      ListEmptyComponent={
        <Text style={styles.hint}>
          {selectedKey
            ? "No events on this day."
            : "Tap a highlighted day to see its events."}
        </Text>
      }
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
  controls: {
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  toggle: {
    alignSelf: "flex-start",
    backgroundColor: color.brown400,
    borderRadius: radius.pill,
    flexDirection: "row",
    padding: space.xs,
  },
  toggleButton: {
    borderRadius: radius.pill,
    paddingHorizontal: space.xl,
    paddingVertical: space.sm,
  },
  toggleActive: {
    backgroundColor: color.beige300,
  },
  toggleLabel: {
    ...typePreset.captionMedium12,
    color: color.khakis,
  },
  toggleLabelActive: {
    color: color.oreo,
  },
  listContent: {
    paddingBottom: space.xxl,
    paddingHorizontal: space.md,
  },
  calendarHeader: {
    paddingBottom: space.lg,
  },
  hint: {
    ...typePreset.caption12,
    color: color.khakis,
    paddingVertical: space.lg,
    textAlign: "center",
  },
  sectionHeader: {
    alignItems: "center",
    backgroundColor: color.oreo,
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
