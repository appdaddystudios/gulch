import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "../../components/Button";
import { DatePicker } from "../../components/DatePicker";
import { DayStepper } from "../../components/DayStepper";
import { EmptyState } from "../../components/EmptyState";
import { EventCard } from "../../components/EventCard";
import { Header } from "../../components/Header";
import { IconButton } from "../../components/IconButton";
import {
  CalendarSmallIcon,
  FileQuestionIcon,
  ListMenuIcon,
  SearchIcon,
} from "../../components/icons";
import { SearchBar } from "../../components/SearchBar";
import { SegmentedControl } from "../../components/SegmentedControl";
import { Toast } from "../../components/Toast";
import { useDbClient, useQuery, type QueryState } from "../../hooks/useQuery";
import { useSaveToast } from "../../hooks/useSaveToast";
import {
  addDaysToKey,
  addMonthsToKey,
  dayTitle,
  monthCursorFromKey,
  type MonthCursor,
} from "../../lib/calendar";
import {
  groupEventsByWeek,
  listUpcomingEvents,
  type EventListItem,
  type EventWeekSection,
} from "../../lib/events";
import { dayKey } from "../../lib/format";
import { captureEvent } from "../../lib/telemetry";
import { color, font, space, type as typePreset } from "../../theme";

type ViewMode = "list" | "month" | "week";

// Debounce so search_performed reflects settled queries, not every keystroke.
const SEARCH_CAPTURE_DELAY_MS = 1000;
// Past this offset the list-mode search bar is fully collapsed into the
// header icon (V3: the segmented control below it stays stuck in place).
const SEARCH_COLLAPSE_RANGE = 96;

const MODE_SEGMENTS = [
  {
    key: "month",
    label: "Month",
    renderIcon: (active: boolean) => (
      <CalendarSmallIcon color={active ? color.gulchGreen : color.khakis} />
    ),
  },
  {
    key: "week",
    label: "Week",
    renderIcon: (active: boolean) => (
      <CalendarSmallIcon color={active ? color.gulchGreen : color.khakis} />
    ),
  },
  {
    key: "list",
    label: "List",
    renderIcon: (active: boolean) => (
      <ListMenuIcon color={active ? color.gulchGreen : color.khakis} />
    ),
  },
] as const;

const loadEvents = (client: Parameters<typeof listUpcomingEvents>[0]) =>
  listUpcomingEvents(client, { limit: 100 });

const matchesQuery = (event: EventListItem, query: string): boolean =>
  [event.name, event.organizerName, event.locationName]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLowerCase().includes(query));

export default function CalendarScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const client = useDbClient();
  const loader = useCallback(loadEvents, []);
  const { state } = useQuery(client, loader);
  const { isSaved, toggle, toastVisible, toastNonce, dismissToast } =
    useSaveToast();

  const todayKey = useMemo(() => dayKey(new Date().toISOString()), []);
  const [mode, setMode] = useState<ViewMode>("list");
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState<MonthCursor>(() =>
    monthCursorFromKey(todayKey),
  );
  const [selectedKey, setSelectedKey] = useState<string>(todayKey);
  const [headerSearch, setHeaderSearch] = useState(false);

  const listRef = useRef<SectionList<EventListItem, EventWeekSection>>(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const searchHeight = scrollY.interpolate({
    inputRange: [0, SEARCH_COLLAPSE_RANGE],
    outputRange: [56, 0],
    extrapolate: "clamp",
  });
  const searchOpacity = scrollY.interpolate({
    inputRange: [0, SEARCH_COLLAPSE_RANGE * 0.7],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  // V3 punch list: soften the Month/Week/List swap with a short fade-in —
  // skipped entirely when the system Reduce Motion setting is on.
  const modeFade = useRef(new Animated.Value(1)).current;
  const reduceMotion = useRef(false);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) {
        reduceMotion.current = enabled;
      }
    });
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (enabled) => {
        reduceMotion.current = enabled;
      },
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  useEffect(() => {
    if (reduceMotion.current) {
      modeFade.setValue(1);
      return;
    }
    modeFade.setValue(0);
    Animated.timing(modeFade, {
      duration: 220,
      easing: Easing.out(Easing.quad),
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [mode, modeFade]);

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
    () => filtered.filter((event) => dayKey(event.startAt) === selectedKey),
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

  const goToday = () => {
    // Recompute at tap time — the mount-time key goes stale past midnight.
    const key = dayKey(new Date().toISOString());
    setCursor(monthCursorFromKey(key));
    setSelectedKey(key);
  };

  const selectDay = (key: string) => {
    setSelectedKey(key);
    setCursor(monthCursorFromKey(key));
  };

  const stepDay = (delta: number) => selectDay(addDaysToKey(selectedKey, delta));

  const revealSearch = () => {
    if (sections.length > 0) {
      listRef.current?.scrollToLocation({
        animated: true,
        itemIndex: 0,
        sectionIndex: 0,
        viewOffset: 0,
      });
    }
    scrollY.setValue(0);
    setHeaderSearch(false);
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

  const segmented = (
    <SegmentedControl segments={MODE_SEGMENTS} value={mode} onChange={switchMode} />
  );

  if (mode !== "list") {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.controlBar}>
          {segmented}
          <View style={styles.controlRight}>
            <Button label="Today" size="s" tone="outline" onPress={goToday} />
            <IconButton
              accessibilityLabel="Search events"
              onPress={() => switchMode("list")}
            >
              <SearchIcon size={20} color={color.khakis} />
            </IconButton>
          </View>
        </View>

        <Animated.View style={[styles.modeBody, { opacity: modeFade }]}>
        {state.status !== "ready" ? (
          <StatusView state={state} />
        ) : (
          <FlatList
            contentContainerStyle={styles.listContent}
            data={dayEvents}
            keyExtractor={(item) => item.id}
            ListHeaderComponent={
              <View style={styles.calendarHeader}>
                <DatePicker
                  cursor={cursor}
                  selectedKey={selectedKey}
                  eventDayKeys={eventDayKeys}
                  weekAnchor={mode === "week" ? selectedKey : undefined}
                  onPrev={() =>
                    mode === "week"
                      ? stepDay(-7)
                      : selectDay(addMonthsToKey(selectedKey, -1))
                  }
                  onNext={() =>
                    mode === "week"
                      ? stepDay(7)
                      : selectDay(addMonthsToKey(selectedKey, 1))
                  }
                  onSelectDay={selectDay}
                />
                <View style={styles.stepperRule} />
                <DayStepper
                  label={dayTitle(selectedKey)}
                  onPrev={() => stepDay(-1)}
                  onNext={() => stepDay(1)}
                />
              </View>
            }
            renderItem={({ item }) => <>{renderCard(item)}</>}
            ItemSeparatorComponent={Separator}
            ListEmptyComponent={
              <Text style={styles.hint}>No events on this day.</Text>
            }
            showsVerticalScrollIndicator={false}
          />
        )}
        </Animated.View>
        <Toast
          key={toastNonce}
          message="Added to your favorites"
          visible={toastVisible}
          onDismiss={dismissToast}
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Header
        rightAction={
          headerSearch ? (
            <Pressable
              accessibilityLabel="Search events"
              accessibilityRole="button"
              hitSlop={8}
              onPress={revealSearch}
            >
              <SearchIcon size={24} color={color.khakis} />
            </Pressable>
          ) : undefined
        }
      />
      <View style={styles.controls}>
        <Animated.View
          style={[
            styles.searchWrap,
            { height: searchHeight, opacity: searchOpacity },
          ]}
        >
          <SearchBar value={search} onChangeText={setSearch} />
        </Animated.View>
        {segmented}
      </View>

      <Animated.View style={[styles.modeBody, { opacity: modeFade }]}>
      {state.status !== "ready" ? (
        <StatusView state={state} />
      ) : sections.length === 0 ? (
        search.trim().length > 0 ? (
          <EmptyState
            align="top"
            icon={<FileQuestionIcon size={32} color={color.gulchGreen} />}
            title="No results"
            subtitle="Please try your search again using different terms."
            action={
              <Button
                label="Clear Search"
                tone="light"
                onPress={() => setSearch("")}
              />
            }
          />
        ) : (
          <Centered>
            <EmptyState
              title="No upcoming events"
              subtitle="Check back soon for new events."
            />
          </Centered>
        )
      ) : (
        <SectionList<EventListItem, EventWeekSection>
          ref={listRef}
          contentContainerStyle={styles.listContent}
          sections={sections}
          keyExtractor={(item) => item.id}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            {
              useNativeDriver: false,
              listener: (event) => {
                const offset = (
                  event as { nativeEvent: { contentOffset: { y: number } } }
                ).nativeEvent.contentOffset.y;
                setHeaderSearch(offset > SEARCH_COLLAPSE_RANGE / 2);
              },
            },
          )}
          scrollEventThrottle={16}
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
      )}
      </Animated.View>
      <Toast
        key={toastNonce}
        message="Added to your favorites"
        visible={toastVisible}
        onDismiss={dismissToast}
      />
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
  modeBody: {
    flex: 1,
  },
  controlBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  controlRight: {
    alignItems: "center",
    flexDirection: "row",
    gap: space.md,
  },
  controls: {
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  searchWrap: {
    overflow: "hidden",
  },
  listContent: {
    paddingBottom: space.xxl,
    paddingHorizontal: space.md,
  },
  calendarHeader: {
    paddingBottom: space.lg,
  },
  stepperRule: {
    backgroundColor: color.brown300,
    height: 1,
    marginVertical: space.lg,
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
